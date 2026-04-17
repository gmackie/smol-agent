export function getTieredRouterContext(runtimeContext: Record<string, any> = {}): Record<string, any> | null {
  const tieredRouter = runtimeContext?.tieredRouter;

  if (!tieredRouter || typeof tieredRouter !== "object") {
    return null;
  }

  return tieredRouter;
}

export function getRuntimeBaseURL(runtimeContext: Record<string, any> = {}): string | undefined {
  const tieredRouter = getTieredRouterContext(runtimeContext);
  if (!tieredRouter || typeof tieredRouter.baseUrl !== "string" || tieredRouter.baseUrl.length === 0) {
    return undefined;
  }

  return tieredRouter.baseUrl;
}

export function buildRuntimeHeaders(runtimeContext: Record<string, any> = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  const tieredRouter = getTieredRouterContext(runtimeContext);

  if (!tieredRouter) {
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
