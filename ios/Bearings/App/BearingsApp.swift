import SwiftUI

@main
struct BearingsApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(.accent)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        Group {
            switch model.phase {
            case .launching:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Color.paper)
            case .signedOut:
                AuthView()
            case .signedIn:
                MainTabView()
            }
        }
        .task { await model.launch() }
        .alert("Something went wrong",
               isPresented: Binding(get: { model.error != nil && model.phase == .signedIn },
                                    set: { if !$0 { model.error = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.error ?? "")
        }
    }
}

/// The app's five places. Settings lives behind Home's toolbar rather
/// than taking a tab; interview practice lives inside the counselor; and
/// Apply is the list, with everything needed to act on each school.
struct MainTabView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab("Home", systemImage: "house", value: AppTab.home) { HomeView() }
            Tab("Explore", systemImage: "magnifyingglass", value: AppTab.explore) { ExploreView() }
            // A parent never reaches the counselor — STUDENT_ONLY_ROUTES.
            if !model.isParent {
                Tab("Counselor", systemImage: "bubble.left.and.text.bubble.right", value: AppTab.counselor) { CounselorView() }
            }
            Tab("Apply", systemImage: "checklist", value: AppTab.apply) { ApplyView() }
            Tab("Planner", systemImage: "square.grid.2x2", value: AppTab.planner) { PlannerView() }
        }
    }
}
