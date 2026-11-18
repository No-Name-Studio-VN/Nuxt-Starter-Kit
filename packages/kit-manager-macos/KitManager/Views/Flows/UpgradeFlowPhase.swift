enum UpgradeFlowPhase {
    case review
    case running
    case finished(UpgradeOutcome)
    case rollingBack
    case rolledBack
}
