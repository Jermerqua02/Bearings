import Foundation
import Observation

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
    private(set) var snapshot: Snapshot?
    /// The last failure worth telling the user about; views show it as an alert.
    var error: String?

    private let api = APIClient.shared

    init() {
        api.onUnauthorized = { [weak self] in self?.dropSession() }
    }

    // MARK: Session

    func launch() async {
        #if DEBUG
        // Lets a script open the simulator already signed in:
        //   SIMCTL_CHILD_BEARINGS_DEV_TOKEN=<token> xcrun simctl launch booted com.promptllc.bearings
        // Compiled out of Release builds entirely.
        if let token = ProcessInfo.processInfo.environment["BEARINGS_DEV_TOKEN"], !token.isEmpty {
            Keychain.saveToken(token)
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
        phase = .signedOut
    }

    func refresh() async throws {
        let res: SnapshotResponse = try await api.get("/api/v1/snapshot")
        viewer = res.viewer
        snapshot = res.snapshot
    }

    // MARK: Lookups

    func school(_ id: String) -> School? {
        snapshot?.schools.first { $0.id == id }
    }

    var isParent: Bool { viewer?.role == .parent }

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

    private func mutate(rollback: @escaping (inout Snapshot) -> Void,
                        _ request: @escaping () async throws -> Void) {
        Task {
            do {
                try await request()
            } catch {
                if snapshot != nil { rollback(&snapshot!) }
                self.error = error.localizedDescription
            }
        }
    }

    private static func escape(_ id: String) -> String {
        id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(["/"])) ?? id
    }
}

struct SignUpForm: Encodable {
    var name = ""
    var email = ""
    var password = ""
    var role: Role = .student
    var acceptedTerms = false
    var meetsAgeRequirement = false
}
