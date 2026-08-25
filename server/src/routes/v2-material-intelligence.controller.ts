import {
  ArgumentsHost,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Param,
  Query,
  Req,
  UseFilters,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { MaterialIntelligenceService } from "../../../services/scientific/src/material-intelligence-service.js";
import {
  PlatformError,
  PlatformService,
} from "../../../services/platform/src/service.js";

function cookieValue(request: FastifyRequest, name: string) {
  const item = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : undefined;
}

function requestHost(request: FastifyRequest) {
  const forwarded = request.headers["x-forwarded-host"];
  return (
    (typeof forwarded === "string"
      ? forwarded
      : (request.headers.host ?? "localhost")
    )
      .split(",")[0]
      ?.split(":")[0]
      ?.toLowerCase() ?? "localhost"
  );
}

@Catch(PlatformError)
class MaterialIntelligenceErrorFilter implements ExceptionFilter {
  catch(error: PlatformError, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<FastifyReply>()
      .status(error.status)
      .send({ error: { code: error.code, message: error.message } });
  }
}

@Controller("v2/material-intelligence")
@UseFilters(MaterialIntelligenceErrorFilter)
export class V2MaterialIntelligenceController {
  constructor(
    private readonly platform: PlatformService,
    private readonly intelligence: MaterialIntelligenceService,
  ) {}

  @Get("materials")
  async materials(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.intelligence.listMaterials(
      (await this.context(request)).context,
      query,
    );
  }

  @Get("materials/:materialId")
  async material(
    @Req() request: FastifyRequest,
    @Param("materialId") materialId: string,
  ) {
    return {
      material: await this.intelligence.getMaterial(
        (await this.context(request)).context,
        materialId,
      ),
    };
  }

  @Get("materials/:materialId/components")
  async components(
    @Req() request: FastifyRequest,
    @Param("materialId") materialId: string,
  ) {
    return {
      components: await this.intelligence.getMaterialComponents(
        (await this.context(request)).context,
        materialId,
      ),
    };
  }

  @Get("materials/:materialId/evidence")
  async evidence(
    @Req() request: FastifyRequest,
    @Param("materialId") materialId: string,
  ) {
    return {
      evidence: await this.intelligence.getMaterialEvidence(
        (await this.context(request)).context,
        materialId,
      ),
    };
  }

  @Get("materials/:materialId/eligibility")
  async eligibility(
    @Req() request: FastifyRequest,
    @Param("materialId") materialId: string,
  ) {
    return {
      eligibility: await this.intelligence.getMaterialEligibility(
        (await this.context(request)).context,
        materialId,
      ),
    };
  }

  @Get("chemical-entities/:entityId")
  async entity(
    @Req() request: FastifyRequest,
    @Param("entityId") entityId: string,
  ) {
    return {
      chemicalEntity: await this.intelligence.getChemicalEntity(
        (await this.context(request)).context,
        entityId,
      ),
    };
  }

  private async context(request: FastifyRequest) {
    if (!request.headers.cookie)
      throw new PlatformError("SESSION_EXPIRED", "Sign in is required.", 401);
    return this.platform.contextFromToken(
      cookieValue(request, this.platform.cookieName) ?? "",
      requestHost(request),
    );
  }
}
