import { apiRequest } from "./backend-api.js";

export async function submitGamificationEvent(payload = {}) {
  return await apiRequest("/api/gamification/event", {
    method: "POST",
    body: payload,
    auth: true
  });
}
