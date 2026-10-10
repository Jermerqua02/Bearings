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
        // The counselor opens as a sheet; while it's up, it presents the paywall
        // itself — a sheet under a sheet is silently never shown.
        .sheet(item: Binding(get: { model.counselorOpen ? nil : model.paywall },
                             set: { model.paywall = $0 })) { reason in
            ProPaywall(reason: reason).presentationBackground(Color.paper)
        }
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
        // Students and parents each have their own counselor.
        .sheet(isPresented: Binding(get: { model.counselorOpen },
                                    set: { model.counselorOpen = $0 })) {
            CounselorView()
                .presentationDragIndicator(.visible)
                .presentationBackground(Color.paper)
        }
        // The first meeting. Home reloads once it's gone, which makes it
        // personal and — for a new Free account — offers the trial.
        .fullScreenCover(isPresented: $model.onboardingOpen, onDismiss: {
            Task { try? await model.refresh() }
        }) {
            OnboardingView()
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

/// Collapses and expands the main nav — but only while the student's
/// finger is actually dragging the page.
///
/// It used to react to any movement, including the coast after a flick.
/// Tap the menu button mid-coast and it would expand, then the still-moving
/// page would collapse it again a moment later, so the tap seemed to do
/// nothing — or the menu shrank out from under the finger and the touch
/// landed on the school card behind it. Momentum now never moves the menu;
/// only a drag does, and the nav stays open after a tap until the next one.
struct NavScrollReporter: ViewModifier {
    @Environment(AppModel.self) private var model
    @State private var dragging = false

    func body(content: Content) -> some View {
        content
            .onScrollPhaseChange { _, phase in
                dragging = phase == .interacting
            }
            .onScrollGeometryChange(for: CGFloat.self) { geo in
                geo.contentOffset.y + geo.contentInsets.top
            } action: { old, new in
                let collapse: Bool?
                if new < 24 {
                    collapse = false // back at the top: always show it
                } else if dragging {
                    let delta = new - old
                    collapse = delta > 6 ? true : delta < -6 ? false : nil
                } else {
                    collapse = nil
                }
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
                // The glass sits behind the button, not inside its label:
                // interactive glass inside a label took the tap for itself,
                // so the menu never opened and the touch could land on the
                // row underneath instead.
                Button {
                    withAnimation(.snappy(duration: 0.3)) { model.navCollapsed = false }
                } label: {
                    Image(systemName: "line.3.horizontal")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Color.ink)
                        .frame(width: 56, height: 56)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .navSurface(Circle())
                .matchedGeometryEffect(id: "nav", in: morph)
                .accessibilityLabel("Show menu")
                .accessibilityIdentifier("nav.expand")
            } else {
                HStack(spacing: 2) {
                    ForEach(Self.items, id: \.0) { tab, label, icon in
                        let active = model.tab == tab
                        Button {
                            if active { model.tabReselected += 1 }
                            model.tab = tab
                            withAnimation(.snappy(duration: 0.3)) { model.navCollapsed = false }
                        } label: {
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
                        .accessibilityIdentifier("nav.\(label.lowercased())")
                    }
                }
                .padding(4)
                .navSurface(Capsule())
                .matchedGeometryEffect(id: "nav", in: morph)
            }

            Spacer()

            Button { model.counselorOpen = true } label: {
                Image(systemName: "bubble.fill")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(.white)
                    .frame(width: 60, height: 60)
                    .background(Color.accent, in: Circle())
                    .shadow(color: .black.opacity(0.14), radius: 14, y: 6)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Ask your counselor")
            .accessibilityIdentifier("nav.counselor")
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
            // Not .interactive(): interactive glass handles touches itself,
            // which is what swallowed the menu button's tap.
            self.glassEffect(.regular, in: shape)
        } else {
            self.background(.ultraThinMaterial, in: shape)
                .overlay(shape.stroke(Color.black.opacity(0.06)))
                .shadow(color: .black.opacity(0.1), radius: 16, y: 6)
        }
    }
}

extension View {
    /// A tab opens on its own first screen. Leaving it pops whatever was
    /// pushed — a school, Settings — while it's out of sight, so coming back
    /// lands on the tab, not wherever it was left; tapping the tab it's
    /// already on does the same, as in every iOS app.
    func tabRoot(_ tab: AppTab, path: Binding<NavigationPath>) -> some View {
        modifier(TabRoot(tab: tab, path: path))
    }
}

private struct TabRoot: ViewModifier {
    @Environment(AppModel.self) private var model
    let tab: AppTab
    @Binding var path: NavigationPath

    func body(content: Content) -> some View {
        content
            .onChange(of: model.tab) { old, _ in if old == tab { path = NavigationPath() } }
            .onChange(of: model.tabReselected) { if model.tab == tab { path = NavigationPath() } }
    }
}
