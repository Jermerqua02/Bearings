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

/// Three places — Home, Explore, Apply — in a floating pill on the left,
/// and the counselor behind its own button on the right. The system tab bar
/// is hidden; `MainNav` draws ours.
struct MainTabView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            Tab(value: AppTab.home) { HomeView().mainNavRoom() }
            Tab(value: AppTab.explore) { ExploreView().mainNavRoom() }
            Tab(value: AppTab.apply) { ApplyView().mainNavRoom() }
        }
        .overlay(alignment: .bottom) { MainNav() }
        // A parent never reaches the counselor — STUDENT_ONLY_ROUTES.
        .sheet(isPresented: Binding(get: { model.counselorOpen && !model.isParent },
                                    set: { model.counselorOpen = $0 })) {
            CounselorView()
                .presentationDragIndicator(.visible)
                .presentationBackground(Color.paper)
        }
    }
}

extension View {
    /// Hide the system tab bar and leave room for ours, so the last row of
    /// any screen can scroll clear of it.
    func mainNavRoom() -> some View {
        self
            .toolbar(.hidden, for: .tabBar)
            .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: 72) }
    }

    /// Collapse the main nav while scrolling down, bring it back scrolling up.
    func collapsesMainNav() -> some View { modifier(NavScrollReporter()) }
}

struct NavScrollReporter: ViewModifier {
    @Environment(AppModel.self) private var model

    func body(content: Content) -> some View {
        content.onScrollGeometryChange(for: CGFloat.self) { geo in
            geo.contentOffset.y + geo.contentInsets.top
        } action: { old, new in
            let delta = new - old
            let collapse: Bool? = new < 24 ? false : delta > 6 ? true : delta < -6 ? false : nil
            if let collapse, collapse != model.navCollapsed {
                withAnimation(.snappy(duration: 0.3)) { model.navCollapsed = collapse }
            }
        }
    }
}

/// The floating nav: a pill of three places that shrinks to a menu button
/// on scroll, and the round counselor button.
struct MainNav: View {
    @Environment(AppModel.self) private var model
    @Namespace private var morph

    private static let items: [(AppTab, String, String)] = [
        (.home, "Home", "house"),
        (.explore, "Explore", "magnifyingglass"),
        (.apply, "Apply", "checklist"),
    ]

    var body: some View {
        HStack(alignment: .center) {
            if model.navCollapsed {
                Button {
                    withAnimation(.snappy(duration: 0.3)) { model.navCollapsed = false }
                } label: {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color.ink)
                        .frame(width: 56, height: 56)
                        .navSurface(Circle())
                        .matchedGeometryEffect(id: "nav", in: morph)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Show menu")
            } else {
                HStack(spacing: 2) {
                    ForEach(Self.items, id: \.0) { tab, label, icon in
                        let active = model.tab == tab
                        Button { model.tab = tab } label: {
                            VStack(spacing: 3) {
                                Image(systemName: icon).font(.system(size: 17, weight: active ? .semibold : .regular))
                                Text(label).font(.system(size: 11, weight: active ? .semibold : .medium))
                            }
                            .foregroundStyle(active ? Color.white : Color.ink)
                            .frame(width: 70, height: 48)
                            .background(active ? Color.ink : .clear, in: Capsule())
                            .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(active ? .isSelected : [])
                    }
                }
                .padding(4)
                .navSurface(Capsule())
                .matchedGeometryEffect(id: "nav", in: morph)
            }

            Spacer()

            if !model.isParent {
                Button { model.counselorOpen = true } label: {
                    Image(systemName: "bubble.fill")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(Color.ink)
                        .frame(width: 60, height: 60)
                        .background(Color.highlight, in: Circle())
                        .shadow(color: .black.opacity(0.14), radius: 14, y: 6)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ask your counselor")
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 6)
    }
}

extension View {
    /// The nav's frosted surface — Liquid Glass where the system has it.
    @ViewBuilder
    func navSurface<S: Shape>(_ shape: S) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular.interactive(), in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(Color.black.opacity(0.06)))
                .shadow(color: .black.opacity(0.1), radius: 16, y: 6)
        }
    }
}
