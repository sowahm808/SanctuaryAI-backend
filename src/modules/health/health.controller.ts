import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FirebaseService } from "../../database/firebase.service";
import { ThemeGenerationQueue } from "../themes/theme-generation.queue";

@Controller("health")
export class HealthController {
  constructor(private readonly firebase: FirebaseService, private readonly queue: ThemeGenerationQueue, private readonly config: ConfigService) {}
  @Get() live() {
    return { status: "ok" };
  }
  @Get("live") liveness() {
    return { status: "ok" };
  }
  @Get("ready") async readiness() {
    try {
      await this.firebase.health();
      const queue = await this.queue.readiness();
      if (queue.queue.status !== "up" || !this.config.get<string>("OPENAI_API_KEY")?.trim()) throw new Error("dependency unavailable");
      return { status: "ready", checks: { firestore: { status: "up" }, provider: { status: "up" }, ...queue } };
    } catch {
      throw new ServiceUnavailableException("Service is not ready");
    }
  }
}
