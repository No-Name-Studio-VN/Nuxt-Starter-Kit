// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "KitManagerCore",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "KitManagerCore", targets: ["KitManagerCore"]),
    ],
    targets: [
        .target(name: "KitManagerCore"),
        .testTarget(
            name: "KitManagerCoreTests",
            dependencies: ["KitManagerCore"]
        ),
    ]
)
