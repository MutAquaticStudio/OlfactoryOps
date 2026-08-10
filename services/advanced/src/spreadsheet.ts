import { strFromU8, unzipSync } from 'fflate'
import { PlatformError } from '../../platform/src/service.js'

export type SpreadsheetRecord = { sourceRowNumber: number; values: Record<string, string> }

const MAX_ROWS = 2_000
const MAX_COLUMNS = 80
const MAX_CELL_LENGTH = 4_000
const MAX_UNPACKED_BYTES = 12_000_000
const MAX_COMPRESSED_BYTES = 12_000_000

function assertZipHeader(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) throw new PlatformError('IMPORT_XLSX_INVALID', 'The XLSX archive header is invalid.')
}

function zipPrefilter(bytes: Uint8Array) {
  assertZipHeader(bytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 0
  let unpacked = 0
  let compressed = 0
  let entries = 0
  const maxEntries = 100
  while (offset + 30 <= bytes.length && entries <= maxEntries) {
    const signature = view.getUint32(offset, true)
    if (signature !== 0x04034b50) break
    const compressedSize = view.getUint32(offset + 18, true)
    const uncompressedSize = view.getUint32(offset + 22, true)
    const fileNameLength = view.getUint16(offset + 26, true)
    const extraFieldLength = view.getUint16(offset + 28, true)
    if (fileNameLength < 0 || extraFieldLength < 0) throw new PlatformError('IMPORT_XLSX_INVALID', 'The XLSX archive format is unsupported.')
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength
    if (dataOffset > bytes.length || dataOffset + compressedSize > bytes.length) throw new PlatformError('IMPORT_XLSX_INVALID', 'The XLSX archive is malformed.')
    entries += 1
    unpacked += uncompressedSize
    compressed += compressedSize
    if (compressedSize > MAX_COMPRESSED_BYTES) throw new PlatformError('IMPORT_XLSX_SIZE_INVALID', 'The XLSX archive exceeds the supported safe import size.')
    if (compressed > MAX_COMPRESSED_BYTES) throw new PlatformError('IMPORT_XLSX_SIZE_INVALID', 'The XLSX archive exceeds the supported safe import size.')
    if (entries > maxEntries) throw new PlatformError('IMPORT_XLSX_SIZE_INVALID', 'The XLSX archive has too many parts.')
    if (unpacked > MAX_UNPACKED_BYTES) throw new PlatformError('IMPORT_XLSX_SIZE_INVALID', 'The XLSX archive exceeds the supported safe import size.')
    offset = dataOffset + compressedSize
  }
  if (!entries) throw new PlatformError('IMPORT_XLSX_INVALID', 'The XLSX archive has no readable entries.')
}

function decodeXml(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-fA-F]+);/g, (entity, decimal, hexadecimal) => {
    if (entity === '&amp;') return '&'
    if (entity === '&lt;') return '<'
    if (entity === '&gt;') return '>'
    if (entity === '&quot;') return '"'
    if (entity === '&apos;') return "'"
    const code = Number.parseInt(decimal ?? hexadecimal, hexadecimal ? 16 : 10)
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}

function xmlText(fragment: string) {
  return decodeXml([...fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1] ?? '').join(''))
}

function safeCell(value: string) {
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (normalized.length > MAX_CELL_LENGTH) throw new PlatformError('IMPORT_CELL_TOO_LARGE', 'An import cell exceeds the supported size.', 422)
  if (/^[=@+\-]/.test(normalized)) throw new PlatformError('IMPORT_FORMULA_CELL_DENIED', 'Spreadsheet formula-like cells are not accepted.', 422)
  return normalized
}

function columnIndex(reference: string) {
  const letters = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase()
  if (!letters) throw new PlatformError('IMPORT_XLSX_CELL_INVALID', 'An XLSX cell is missing a column reference.', 422)
  let index = 0
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function headerKey(value: string, index: number) {
  const key = value.trim()
  if (!key) throw new PlatformError('IMPORT_HEADER_INVALID', `Column ${index + 1} needs a header.`, 422)
  return key
}

function recordsFromGrid(grid: string[][]): SpreadsheetRecord[] {
  const first = grid.findIndex((row) => row.some((value) => value.trim()))
  if (first < 0) throw new PlatformError('IMPORT_EMPTY', 'The source file contains no header row.', 422)
  const headers = grid[first]!.map(headerKey)
  if (headers.length > MAX_COLUMNS || new Set(headers.map((item) => item.toLocaleLowerCase())).size !== headers.length) throw new PlatformError('IMPORT_HEADER_INVALID', 'Import headers must be unique and within the supported column limit.', 422)
  const records: SpreadsheetRecord[] = []
  for (let index = first + 1; index < grid.length; index += 1) {
    const values = grid[index] ?? []
    if (!values.some((value) => value.trim())) continue
    const record: Record<string, string> = {}
    headers.forEach((header, column) => { record[header] = safeCell(values[column] ?? '') })
    records.push({ sourceRowNumber: index + 1, values: record })
    if (records.length > MAX_ROWS) throw new PlatformError('IMPORT_TOO_MANY_ROWS', 'An import may contain at most two thousand data rows.', 422)
  }
  if (!records.length) throw new PlatformError('IMPORT_EMPTY', 'The source file contains no data rows.', 422)
  return records
}

export function parseCsvImport(bytes: Uint8Array): SpreadsheetRecord[] {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (text.includes('\0')) throw new PlatformError('IMPORT_SOURCE_INVALID', 'The CSV source contains an invalid control character.', 422)
  const grid: string[][] = [[]]
  let field = ''; let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1 }
      else if (char === '"') quoted = false
      else field += char
      continue
    }
    if (char === '"') {
      if (field.length) throw new PlatformError('IMPORT_CSV_INVALID', 'A quote must begin at the start of a CSV field.', 422)
      quoted = true
    } else if (char === ',') { grid[grid.length - 1]!.push(field); field = '' }
    else if (char === '\n') { grid[grid.length - 1]!.push(field); grid.push([]); field = '' }
    else if (char !== '\r') field += char
  }
  if (quoted) throw new PlatformError('IMPORT_CSV_INVALID', 'The CSV source contains an unterminated quoted field.', 422)
  grid[grid.length - 1]!.push(field)
  return recordsFromGrid(grid)
}

function workbookSheetPath(files: Record<string, Uint8Array>) {
  const workbook = strFromU8(files['xl/workbook.xml'] ?? (() => { throw new PlatformError('IMPORT_XLSX_INVALID', 'The XLSX workbook manifest is missing.', 422) })())
  const relationships = strFromU8(files['xl/_rels/workbook.xml.rels'] ?? (() => { throw new PlatformError('IMPORT_XLSX_INVALID', 'The XLSX workbook relationships are missing.', 422) })())
  if (workbook.includes('<!') || relationships.includes('<!')) throw new PlatformError('IMPORT_XLSX_INVALID', 'XML declarations are not supported in XLSX imports.', 422)
  const relationshipId = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"[^>]*>/)?.[1]
  const target = relationshipId ? relationships.match(new RegExp(`<Relationship\\b[^>]*\\bId="${relationshipId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*\\bTarget="([^"]+)"[^>]*>`))?.[1] : undefined
  if (!target || target.includes('..') || !/^[\w./-]+$/.test(target)) throw new PlatformError('IMPORT_XLSX_INVALID', 'The XLSX workbook has no safe first worksheet.', 422)
  return `xl/${target.replace(/^\//, '')}`
}

function parseSharedStrings(xml: string | undefined) {
  if (!xml) return []
  if (xml.includes('<!')) throw new PlatformError('IMPORT_XLSX_INVALID', 'XML declarations are not supported in XLSX imports.', 422)
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => xmlText(match[1] ?? ''))
}

export function parseXlsxImport(bytes: Uint8Array): SpreadsheetRecord[] {
  zipPrefilter(bytes)
  let files: Record<string, Uint8Array>
  try { files = unzipSync(bytes) } catch { throw new PlatformError('IMPORT_XLSX_INVALID', 'The XLSX archive could not be read.', 422) }
  const entries = Object.entries(files)
  const total = entries.reduce((sum, [, value]) => sum + value.byteLength, 0)
  if (!entries.length || entries.length > 100 || total > MAX_UNPACKED_BYTES) throw new PlatformError('IMPORT_XLSX_SIZE_INVALID', 'The XLSX archive exceeds the supported safe import size.', 422)
  const sheetPath = workbookSheetPath(files)
  const sheetData = files[sheetPath]
  if (!sheetData) throw new PlatformError('IMPORT_XLSX_INVALID', 'The first XLSX worksheet is missing.', 422)
  const sheet = strFromU8(sheetData)
  if (sheet.includes('<!') || /<f(?:\s|>)/.test(sheet)) throw new PlatformError('IMPORT_XLSX_FORMULA_DENIED', 'XLSX formulas and XML declarations are not accepted.', 422)
  const shared = parseSharedStrings(files['xl/sharedStrings.xml'] ? strFromU8(files['xl/sharedStrings.xml']!) : undefined)
  const grid: string[][] = []
  for (const row of sheet.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(row[1]); const cells: string[] = []
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > MAX_ROWS + 1) throw new PlatformError('IMPORT_TOO_MANY_ROWS', 'The XLSX workbook exceeds the supported row limit.', 422)
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cell[1] ?? ''; const body = cell[2] ?? ''
      const reference = attributes.match(/\br="([A-Z]+\d+)"/i)?.[1] ?? ''
      const index = columnIndex(reference)
      if (index >= MAX_COLUMNS) throw new PlatformError('IMPORT_TOO_MANY_COLUMNS', 'The XLSX workbook exceeds the supported column limit.', 422)
      const type = attributes.match(/\bt="([^"]+)"/)?.[1]
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
      const value = type === 's' ? (shared[Number(raw)] ?? '') : type === 'inlineStr' ? xmlText(body) : decodeXml(raw)
      cells[index] = value
    }
    grid[rowNumber - 1] = cells
  }
  return recordsFromGrid(grid.map((row) => row ?? []))
}

export function parseSpreadsheet(format: 'CSV' | 'XLSX', bytes: Uint8Array) {
  return format === 'CSV' ? parseCsvImport(bytes) : parseXlsxImport(bytes)
}
