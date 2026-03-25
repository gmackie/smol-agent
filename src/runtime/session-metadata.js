export function buildSessionMetadata({ name, tieredRouter } = {}) {
  return {
    name: name || null,
    runtimeContext: tieredRouter
      ? {
          tieredRouter: {
            baseUrl: tieredRouter.baseUrl,
            workflowId: tieredRouter.workflowId,
            protectionLevel: tieredRouter.protectionLevel || "standard",
          },
        }
      : {},
  };
}
