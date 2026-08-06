import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { FirebaseService } from "../../database/firebase.service";
import { ThemeGenerationQueue } from "../themes/theme-generation.queue";

@Controller("health")
export class HealthController {
  constructor(private readonly firebase: FirebaseService, private readonly queue: ThemeGenerationQueue) {}
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
      return { status: "ready", checks: { firebase: "up", firestore: "up", redis: "up", ...queue } };
    } catch {
      throw new ServiceUnavailableException("Service is not ready");
    }
  }
}
