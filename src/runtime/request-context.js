export function buildRuntimeHeaders(runtimeContext = {}) {
  const headers = {};
  const tieredRouter = runtimeContext?.tieredRouter;

  if (!tieredRouter || typeof tieredRouter !== "object") {
    return headers;
  }

  if (tieredRouter.workflowId !== undefined && tieredRouter.workflowId !== null) {
    headers["X-Workflow-Id"] = String(tieredRouter.workflowId);
  }

  if (tieredRouter.protectionLevel) {
    headers["X-Protection-Level"] = tieredRouter.protectionLevel;
  }

  return headers;
}
