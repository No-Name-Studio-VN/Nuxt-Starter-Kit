public struct RenderPlan: Sendable, Equatable {
    public let preview: Loadable<TransitionReport>
    public let inspect: Loadable<InspectReport>
    public let previewJob: RenderJob?
    public let inspectJob: RenderJob?

    public init(
        preview: Loadable<TransitionReport>, inspect: Loadable<InspectReport>, previewJob: RenderJob?,
        inspectJob: RenderJob?
    ) {
        self.preview = preview
        self.inspect = inspect
        self.previewJob = previewJob
        self.inspectJob = inspectJob
    }
}
