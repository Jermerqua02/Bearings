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
    /// The counselor sheet, opened from the chat button on any screen.
    var counselorOpen = false
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
        Keychain.deleteToken()
        viewer = nil
        snapshot = nil
        avatar = nil
        avatarVersion = nil
        phase = .signedOut
    }

    func refresh() async throws {
        let res: SnapshotResponse = try await api.get("/api/v1/snapshot")
        viewer = res.viewer
        snapshot = res.snapshot
        await syncAvatar()
    }

    // MARK: Home state

    /// Where the student lives. Nil for a parent, or before they've said.
    var homeState: String? {
        if case .student(let p) = snapshot?.profile { return p.homeState }
        return nil
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

    // MARK: Pro

    /// Pro — or a server from before Pro, where everything was open.
    var isPro: Bool { viewer?.plan?.isPro ?? true }

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

    func isOnList(_ schoolId: String) -> Bool {
        snapshot?.list.contains { $0.schoolId == schoolId } ?? false
    }

    /// Save a school, at the tier the server computed for it — recomputing
    /// here risks saving a tier that disagrees with the badge beside it.
    func addToList(_ school: School, tier: ChanceTier?) {
        guard snapshot != nil, !isOnList(school.id) else { return }
        let entry = ListEntry(schoolId: school.id, tier: tier ?? .target, plan: nil,
                              status: .considering, outcome: nil, notes: nil)
        snapshot!.list.append(entry)
        if !snapshot!.schools.contains(where: { $0.id == school.id }) { snapshot!.schools.append(school) }

        struct Body: Encodable { let schoolId: String; let tier: ChanceTier; let status: ListEntry.Status }
        mutate(rollback: { $0.list.removeAll { $0.schoolId == school.id } }) {
            try await self.api.perform("POST", "/api/v1/list",
                                       Body(schoolId: school.id, tier: entry.tier, status: entry.status))
        }
    }

    func toggleList(_ school: School, tier: ChanceTier?) {
        if isOnList(school.id) { removeFromList(school.id) } else { addToList(school, tier: tier) }
    }

    func removeFromList(_ schoolId: String) {
        guard let i = snapshot?.list.firstIndex(where: { $0.schoolId == schoolId }) else { return }
        let removed = snapshot!.list.remove(at: i)
        mutate(rollback: { $0.list.insert(removed, at: i) }) {
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
