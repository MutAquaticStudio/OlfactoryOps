import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common'
import { NorthStarService } from '../services/northstar.service.js'

@Controller()
export class NorthStarController {
  constructor(@Inject(NorthStarService) private readonly northStar: NorthStarService) {}

  @Get('phases')
  phases() {
    return this.northStar.phases()
  }

  @Get('domains')
  domains() {
    return this.northStar.domains()
  }

  @Get('materials')
  materials() {
    return this.northStar.materials()
  }

  @Get('materials/:id')
  material(@Param('id') id: string) {
    return this.northStar.material(id)
  }

  @Get('formulas/:id/resolve')
  resolveFormula(@Param('id') id: string) {
    return this.northStar.resolveFormula(id)
  }

  @Get('inventory/summary')
  inventorySummary() {
    return this.northStar.inventorySummary()
  }

  @Get('inventory/movements')
  inventoryMovements() {
    return this.northStar.inventoryMovements()
  }

  @Get('documents')
  documents() {
    return this.northStar.documents()
  }

  @Get('documents/download-audit')
  documentDownloadAudit() {
    return this.northStar.documentDownloadAudit()
  }

  @Post('documents/:id/signed-url')
  requestDocumentSignedUrl(@Param('id') id: string) {
    return this.northStar.requestDocumentSignedUrl(id)
  }

  @Get('lab-usage/plan')
  labUsagePlan(@Query('formulaId') formulaId = 'frm-0421', @Query('grams') grams = '12.5') {
    return this.northStar.labUsagePlan(formulaId, Number(grams))
  }

  @Post('lab-usage/commit')
  commitLabUsage(@Body() body: { formulaId?: string; grams?: number }) {
    return this.northStar.commitLabUsage(body.formulaId ?? 'frm-0421', body.grams ?? 12.5)
  }

  @Post('lab-usage/reverse-latest')
  reverseLatestLabUsage() {
    return this.northStar.reverseLatestLabUsage()
  }
}
