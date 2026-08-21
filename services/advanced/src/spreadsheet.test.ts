import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { PlatformError } from '../../platform/src/service.js'
import { parseCsvImport, parseXlsxImport } from './spreadsheet.js'

function minimalWorkbook(sheet: string) {
  return zipSync({
    'xl/workbook.xml': strToU8('<workbook xmlns:r="r"><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  })
}

describe('safe spreadsheet parsing', () => {
  it('parses bounded RFC4180 CSV rows', () => {
    const rows = parseCsvImport(new TextEncoder().encode('Material Name,Internal Code\n"Iso, E Super",ISO-E\n'))
    expect(rows).toEqual([{ sourceRowNumber: 2, values: { 'Material Name': 'Iso, E Super', 'Internal Code': 'ISO-E' } }])
  })

  it('rejects formula-looking CSV values', () => {
    expect(() => parseCsvImport(new TextEncoder().encode('Name\n=WEBSERVICE("https://bad.example")'))).toThrow(PlatformError)
  })

  it('parses a cell-only XLSX worksheet without executing any formula', () => {
    const bytes = minimalWorkbook('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Code</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Hedione</t></is></c><c r="B2" t="inlineStr"><is><t>HED</t></is></c></row></sheetData></worksheet>')
    expect(parseXlsxImport(bytes)).toEqual([{ sourceRowNumber: 2, values: { Name: 'Hedione', Code: 'HED' } }])
  })

  it('rejects XLSX formulas before row projection', () => {
    const bytes = minimalWorkbook('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row><row r="2"><c r="A2"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>')
    expect(() => parseXlsxImport(bytes)).toThrow(PlatformError)
  })

  it('rejects XLSX archives with too many local parts', () => {
    const files: Record<string, Uint8Array> = {}
    for (let index = 1; index <= 105; index += 1) files[`xl/parts/part-${String(index).padStart(4, '0')}.bin`] = strToU8(`part-${index}`)
    files['xl/workbook.xml'] = strToU8('<workbook xmlns:r="r"><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>')
    files['xl/_rels/workbook.xml.rels'] = strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
    files['xl/worksheets/sheet1.xml'] = strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row></sheetData></worksheet>')
    const bytes = zipSync(files)
    expect(() => parseXlsxImport(bytes)).toThrow(PlatformError)
  })

  it('rejects XLSX archives with unsafe compressed payload size before unzip', () => {
    const bytes = minimalWorkbook('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c></row></sheetData></worksheet>')
    const payload = Buffer.from(bytes)
    const extra = Buffer.alloc(13_000_000)
    const mutated = Buffer.concat([payload, extra])
    const view = new DataView(mutated.buffer, mutated.byteOffset, mutated.byteLength)
    const fileNameLength = view.getUint16(26, true)
    const extraFieldLength = view.getUint16(28, true)
    const dataOffset = 30 + fileNameLength + extraFieldLength
    view.setUint32(18, 13_000_000, true)
    view.setUint32(22, 13_000_000, true)
    expect(dataOffset + 13_000_000).toBeLessThanOrEqual(mutated.byteLength)
    expect(() => parseXlsxImport(mutated)).toThrow(PlatformError)
  })
})
