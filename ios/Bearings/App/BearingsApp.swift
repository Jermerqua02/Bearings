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

/// The tabs from AppNav.tsx that exist natively so far. A parent never
/// gets the counselor tab — the same rule as STUDENT_ONLY_ROUTES.
struct MainTabView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        TabView {
            Tab("Home", systemImage: "house") { HomeView() }
            if !model.isParent {
                Tab("Counselor", systemImage: "bubble.left.and.text.bubble.right") { CounselorView() }
            }
            Tab("List", systemImage: "list.bullet") { SchoolListView() }
            Tab("Settings", systemImage: "gearshape") { SettingsView() }
        }
    }
}
