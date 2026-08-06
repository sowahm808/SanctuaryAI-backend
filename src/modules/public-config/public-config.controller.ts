import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

export interface PublicConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
  };
}

@ApiTags("Configuration")
@Controller("config")
export class PublicConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get("public")
  @ApiOperation({ summary: "Return the non-secret client configuration" })
  getPublicConfig(): PublicConfig {
    const projectId = this.config.getOrThrow<string>("FIREBASE_PROJECT_ID");

    return {
      firebase: {
        apiKey: this.config.getOrThrow<string>("FIREBASE_API_KEY"),
        authDomain: `${projectId}.firebaseapp.com`,
        projectId,
      },
    };
  }
}
