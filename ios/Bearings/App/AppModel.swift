import Foundation
import Observation
import UIKit

/// The app's single source of truth — the native counterpart of
/// lib/profile-context.tsx. Holds the snapshot and owns every mutation, so
/// views never talk to the API directly.
///
/// Mutations are optimistic, as on the web: the change shows at once, the
/// request follows, and a failure puts the old value back and says so.
@Observable
final class AppModel {
    enum Phase { case launching, signedOut, signedIn }

    private(set) var phase: Phase = .launching
    private(set) var viewer: Viewer?
    var snapshot: Snapshot?
    /// The last failure worth telling the user about; views show it as an alert.
    var error: String?
    /// Bumped whenever the course plan or transcripts change, so the
    /// planner refetches the GPA the server computes from them.
    var plannerRevision = 0
    /// The profile photo, once fetched. Nil means none set (or not loaded).
    var avatar: UIImage?
    private var avatarVersion: String?

    /// Set by "Ask the counselor" on a school; the counselor tab opens a
    /// conversation about it and clears this.
    var askAbout: School?
    /// Which tab is showing, so a screen can send the student elsewhere.
    var tab: AppTab = .home {
        didSet { if tab != oldValue { navCollapsed = false } }
    }
    /// Bumped when the showing tab's button is tapped again: back to its top.
    var tabReselected = 0
    /// The counselor sheet, opened from the chat button on any screen.
    var counselorOpen = false
    /// The first meeting — the welcome tour and the questions — over
    /// everything else. Opens by itself once per launch for an account
    /// with no profile; after that, from the prompts that ask for one.
    var onboardingOpen = false
    /// Where the meeting got to, kept across a close and reopen.
    var onboardingDraft = OnboardingDraft()
    private var onboardingOffered = false
    /// The main nav shrinks to a menu button while the student scrolls
    /// down, and comes back on scroll up or a tap.
    var navCollapsed = false
    #if DEBUG
    var devSchool: String?
    var devSettings = false
    var devYou = false
    #endif

    let api = APIClient.shared

    init() {
        api.onUnauthorized = { [weak self] in self?.dropSession() }
    }

    // MARK: Session

    func launch() async {
        #if DEBUG
        // Lets a script open the simulator already signed in:
        //   SIMCTL_CHILD_BEARINGS_DEV_TOKEN=<token> xcrun simctl launch booted com.promptllc.bearings
        // Compiled out of Release builds entirely.
        let env = ProcessInfo.processInfo.environment
        if let token = env["BEARINGS_DEV_TOKEN"], !token.isEmpty {
            Keychain.saveToken(token)
        }
        // BEARINGS_DEV_TAB=explore|counselor|apply|planner opens on that tab;
        // BEARINGS_DEV_SCHOOL=<id> opens that school over Explore.
        switch env["BEARINGS_DEV_TAB"] {
        case "explore": tab = .explore
        case "counselor": counselorOpen = true
        case "apply": tab = .apply
        case "you": devYou = true
        case "settings": devSettings = true
        default: break
        }
        if let school = env["BEARINGS_DEV_SCHOOL"], !school.isEmpty {
            tab = .explore
            devSchool = school
        }
        #endif
        guard api.token != nil else { phase = .signedOut; return }
        do {
            try await refresh()
            phase = .signedIn
        } catch let e as APIError where e.isUnauthorized {
            phase = .signedOut
        } catch {
            // Offline at launch with a token in hand: stay signed in and let
            // the home screen offer a retry, rather than demand a password.
            phase = .signedIn
            self.error = error.localizedDescription
        }
    }

    func signIn(email: String, password: String) async throws {
        try await api.signIn(email: email.trimmingCharacters(in: .whitespaces).lowercased(),
                             password: password)
        try await refresh()
        phase = .signedIn
    }

    func signUp(_ form: SignUpForm) async throws {
        struct Ok: Decodable { let ok: Bool }
        let _: Ok = try await api.post("/api/v1/auth/sign-up", form)
        try await signIn(email: form.email, password: form.password)
    }

    func signOut() async {
        await api.signOut()
        dropSession()
    }

    private func dropSession() {
        ProStore.shared.stopListening()
        Keychain.deleteToken()
        viewer = nil
        snapshot = nil
        avatar = nil
        avatarVersion = nil
        onboardingOpen = false
        onboardingDraft = OnboardingDraft()
        onboardingOffered = false
        phase = .signedOut
    }

    /// Once per account, the first time a Free account arrives with a
    /// profile (onboarding done): the trial offer, with "Not now".
    private func offerProOnce() {
        guard let viewer, !isPro, !proRemoved, snapshot?.profile != nil, viewer.role != .admin else { return }
        let key = "proIntroShown-\(viewer.id)"
        guard !UserDefaults.standard.bool(forKey: key) else { return }
        UserDefaults.standard.set(true, forKey: key)
        paywall = PaywallReason(message: nil, intro: true)
    }

    /// Purchases: the store knows whose they are, and hears renewals.
    private func startStore() {
        ProStore.shared.model = self
        ProStore.shared.listen()
    }

    func refresh() async throws {
        let res: SnapshotResponse = try await api.get("/api/v1/snapshot")
        viewer = res.viewer
        snapshot = res.snapshot
        startStore()
        offerOnboardingOnce()
        offerProOnce()
        await syncAvatar()
    }

    // MARK: Onboarding

    /// No profile yet: start the first meeting rather than leave them on a
    /// Home with nothing in it. Once per launch, so closing it sticks.
    private func offerOnboardingOnce() {
        guard snapshot != nil, snapshot?.profile == nil, !onboardingOffered else { return }
        onboardingOffered = true
        onboardingOpen = true
    }

    func startOnboarding() {
        onboardingOpen = true
    }

    /// Whether this account has seen the welcome tour on this device.
    var welcomeTourSeen: Bool {
        get { viewer.map { UserDefaults.standard.bool(forKey: "welcomeTourSeen-\($0.id)") } ?? false }
        set { if let viewer { UserDefaults.standard.set(newValue, forKey: "welcomeTourSeen-\(viewer.id)") } }
    }

    /// Save the answers as the profile; returns the summary to show back.
    /// Runs again on a second pass — the save is an upsert.
    func completeOnboarding(_ answers: OnboardingAnswers) async throws -> String {
        let role: Role = viewer?.role == .admin ? (answers.role ?? .student) : (viewer?.role ?? .student)
        struct Saved: Decodable { let summary: String }
        let saved: Saved = try await api.post("/api/v1/onboarding", answers.body(as: role))
        return saved.summary
    }

    /// "That's me": close the meeting. The reload that makes Home personal
    /// (and offers the trial) runs once the cover is gone — a sheet
    /// presented under a full-screen cover is never shown.
    func finishOnboarding() {
        onboardingDraft = OnboardingDraft()
        onboardingOpen = false
    }

    // MARK: Home state

    /// Where the family lives — the student's, or a parent's own. Nil until they've said.
    var homeState: String? {
        switch snapshot?.profile {
        case .student(let p): p.homeState
        case .parent(let p): p.homeState
        case nil: nil
        }
    }

    /// Save it, then reload so every price recomputes against it.
    func setHomeState(_ code: String) async throws {
        struct Body: Encodable { let state: String }
        try await api.perform("PUT", "/api/v1/me/home-state", Body(state: code))
        try await refresh()
        homeStateRevision += 1
    }

    /// Bumped when the home state changes, for views holding prices worked
    /// out against the old one (a school page) to reload.
    var homeStateRevision = 0

    // MARK: Profile photo

    /// Fetch the photo only when the server says it changed.
    private func syncAvatar() async {
        let version = viewer?.avatarUpdatedAt
        guard version != avatarVersion else { return }
        avatarVersion = version
        guard version != nil, let data = try? await api.data("/api/v1/me/avatar") else {
            avatar = nil
            return
        }
        avatar = UIImage(data: data)
    }

    /// Square-crop from the center, shrink to 512px, upload as JPEG. Shows
    /// at once; reverts if the upload fails.
    func setAvatar(_ image: UIImage) async {
        let prepared = image.squareCropped(to: 512)
        guard let jpeg = prepared.jpegData(compressionQuality: 0.85) else { return }
        let before = avatar
        avatar = prepared
        struct Saved: Decodable { let updatedAt: String }
        do {
            let saved: Saved = try await api.upload("/api/v1/me/avatar", data: jpeg,
                                                    filename: "avatar.jpg", mimeType: "image/jpeg")
            avatarVersion = saved.updatedAt
        } catch {
            avatar = before
            self.error = error.localizedDescription
        }
    }

    func removeAvatar() async {
        let before = avatar
        avatar = nil
        do {
            try await api.perform("DELETE", "/api/v1/me/avatar")
            avatarVersion = nil
        } catch {
            avatar = before
            self.error = error.localizedDescription
        }
    }

    // MARK: Lookups

    func school(_ id: String) -> School? {
        snapshot?.schools.first { $0.id == id }
    }

    var isParent: Bool { viewer?.role == .parent }

    /// A linked parent's student, by first name — "Riley's list".
    var linkedStudentName: String? { snapshot?.studentFirstName }

    // MARK: Pro

    /// Pro — or a server from before Pro, where everything was open.
    var isPro: Bool { viewer?.plan?.isPro ?? true }

    /// An admin removed Pro from this account; the paywall says so instead
    /// of selling something that wouldn't count.
    var proRemoved: Bool { viewer?.plan?.blocked ?? false }

    /// What's left of the Free sample of the counselor.
    var sample: Plan.Sample? { isPro ? nil : viewer?.plan?.sample }

    /// The paywall, when it's showing, and what sent them there.
    var paywall: PaywallReason?

    func showPaywall(_ message: String? = nil) {
        paywall = PaywallReason(message: message)
    }

    /// A sample message or practice question was used; keep the count true
    /// without refetching the whole account.
    func usedSample(_ kind: SampleKind) {
        guard var plan = viewer?.plan, var s = plan.sample else { return }
        switch kind {
        case .chat: s.chat = max(0, s.chat - 1)
        case .interview: s.interview = max(0, s.interview - 1)
        }
        plan.sample = s
        viewer?.plan = plan
    }

    enum SampleKind { case chat, interview }

    /// The server said Pro (402): show the paywall instead of an error.
    /// True when that's what happened.
    @discardableResult
    func handlePro(_ error: Error) -> Bool {
        guard let e = error as? APIError, e.status == 402 else { return false }
        showPaywall(e.message)
        return true
    }

    // MARK: List

    func updateEntry(_ schoolId: String, _ change: (inout ListEntry) -> Void) {
        guard let i = snapshot?.list.firstIndex(where: { $0.schoolId == schoolId }) else { return }
        let before = snapshot!.list[i]
        var after = before
        change(&after)
        snapshot!.list[i] = after

        struct Patch: Encodable {
            let tier: ChanceTier?, plan: ApplicationPlan?, status: ListEntry.Status?
            let outcome: ListEntry.Outcome?, notes: String?
        }
        let patch = Patch(
            tier: after.tier != before.tier ? after.tier : nil,
            plan: after.plan != before.plan ? after.plan : nil,
            status: after.status != before.status ? after.status : nil,
            outcome: after.outcome != before.outcome ? after.outcome : nil,
            notes: after.notes != before.notes ? after.notes : nil
        )
        mutate(rollback: { $0.list[i] = before }) {
            try await self.api.perform("PATCH", "/api/v1/list/\(Self.escape(schoolId))", patch)
        }
    }

    /// The list this account saves to: a student's one list, or a parent's
    /// own — never their student's, which only the student changes.
    private var savesTo: WritableKeyPath<Snapshot, [ListEntry]> { isParent ? \.ownListValue : \.list }

    /// What's on that list.
    var myList: [ListEntry] { snapshot?[keyPath: savesTo] ?? [] }

    func isOnList(_ schoolId: String) -> Bool {
        myList.contains { $0.schoolId == schoolId }
    }

    /// Save a school, at the tier the server computed for it — recomputing
    /// here risks saving a tier that disagrees with the badge beside it.
    func addToList(_ school: School, tier: ChanceTier?) {
        guard snapshot != nil, !isOnList(school.id) else { return }
        let entry = ListEntry(schoolId: school.id, tier: tier ?? .target, plan: nil,
                              status: .considering, outcome: nil, notes: nil)
        let key = savesTo
        snapshot![keyPath: key].append(entry)
        if !snapshot!.schools.contains(where: { $0.id == school.id }) { snapshot!.schools.append(school) }

        struct Body: Encodable { let schoolId: String; let tier: ChanceTier; let status: ListEntry.Status }
        mutate(rollback: { $0[keyPath: key].removeAll { $0.schoolId == school.id } }) {
            try await self.api.perform("POST", "/api/v1/list",
                                       Body(schoolId: school.id, tier: entry.tier, status: entry.status))
        }
    }

    func toggleList(_ school: School, tier: ChanceTier?) {
        if isOnList(school.id) { removeFromList(school.id) } else { addToList(school, tier: tier) }
    }

    func removeFromList(_ schoolId: String) {
        let key = savesTo
        guard let i = snapshot?[keyPath: key].firstIndex(where: { $0.schoolId == schoolId }) else { return }
        let removed = snapshot![keyPath: key].remove(at: i)
        mutate(rollback: { $0[keyPath: key].insert(removed, at: i) }) {
            try await self.api.perform("DELETE", "/api/v1/list/\(Self.escape(schoolId))")
        }
    }

    // MARK: Check-ins

    func toggleCheckIn(_ id: String, action index: Int) {
        guard let i = snapshot?.checkIns.firstIndex(where: { $0.id == id }) else { return }
        snapshot!.checkIns[i].actions[index].done.toggle()
        mutate(rollback: { $0.checkIns[i].actions[index].done.toggle() }) {
            try await self.api.perform("POST", "/api/v1/check-ins/\(id)/actions/\(index)")
        }
    }

    func dismissCheckIn(_ id: String) {
        guard let i = snapshot?.checkIns.firstIndex(where: { $0.id == id }) else { return }
        snapshot!.checkIns[i].dismissed = true
        mutate(rollback: { $0.checkIns[i].dismissed = false }) {
            try await self.api.perform("POST", "/api/v1/check-ins/\(id)/dismiss")
        }
    }

    // MARK: Plumbing

    func mutate(rollback: @escaping (inout Snapshot) -> Void,
                        _ request: @escaping () async throws -> Void) {
        Task {
            do {
                try await request()
            } catch {
                if snapshot != nil { rollback(&snapshot!) }
                if !handlePro(error) { self.error = error.localizedDescription }
            }
        }
    }

    static func escape(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(["/"])) ?? id
    }
}

/// The three places in the main nav. The counselor isn't a tab — it opens
/// over whatever's showing — and "You" lives under the profile.
enum AppTab: Hashable, CaseIterable { case home, explore, apply }

struct SignUpForm: Encodable {
    var name = ""
    var email = ""
    var password = ""
    var role: Role = .student
    var acceptedTerms = false
    var meetsAgeRequirement = false
}
