export function buildSessionMetadata({ name, tieredRouter }: { name?: string | null; tieredRouter?: Record<string, any> } = {}) {
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
