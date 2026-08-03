import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { FirebaseService } from "../../database/firebase.service";

@Controller("health")
export class HealthController {
  constructor(private readonly firebase: FirebaseService) {}
  @Get() live() {
    return { status: "ok" };
  }
  @Get("live") liveness() {
    return { status: "ok" };
  }
  @Get("ready") async readiness() {
    try {
      await this.firebase.health();
      return { status: "ready", checks: { firebase: "up", firestore: "up" } };
    } catch {
      throw new ServiceUnavailableException("Service is not ready");
    }
  }
}
