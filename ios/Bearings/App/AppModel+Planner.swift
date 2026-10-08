import Foundation

/// Course plan, activity log and transcripts — the planner's writes.
/// Same pattern as the list: change the snapshot, send the request, put
/// the old value back if it fails.
extension AppModel {

    // MARK: Courses

    /// Add a course — planned, in progress, or already finished with its
    /// grade, for students typing in a record rather than uploading one.
    func addCourse(year: Int, subject: Course.Subject, name: String, level: Course.Level,
                   status: Course.Status = .planned, grade: String? = nil) async {
        struct Body: Encodable {
            let year: Int; let subject: Course.Subject; let name: String
            let level: Course.Level; let status: Course.Status; let grade: String?
        }
        let grade = status == .completed ? grade : nil
        do {
            let created: CreatedID = try await api.post("/api/v1/courses",
                Body(year: year, subject: subject, name: name, level: level, status: status, grade: grade))
            snapshot?.coursePlan.append(Course(id: created.id, year: year, subject: subject, name: name,
                                               level: level, status: status, grade: grade))
            plannerChanged()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func updateCourse(_ id: String, _ change: (inout Course) -> Void) {
        guard let i = snapshot?.coursePlan.firstIndex(where: { $0.id == id }) else { return }
        let before = snapshot!.coursePlan[i]
        var after = before
        change(&after)
        snapshot!.coursePlan[i] = after

        struct Patch: Encodable {
            let status: Course.Status?; let grade: String?; let level: Course.Level?
            let name: String?; let subject: Course.Subject?
        }
        let patch = Patch(status: after.status != before.status ? after.status : nil,
                          grade: after.grade != before.grade ? (after.grade ?? "") : nil,
                          level: after.level != before.level ? after.level : nil,
                          name: after.name != before.name ? after.name : nil,
                          subject: after.subject != before.subject ? after.subject : nil)
        mutate(rollback: { snap in
            if let j = snap.coursePlan.firstIndex(where: { $0.id == id }) { snap.coursePlan[j] = before }
        }) {
            try await self.api.perform("PATCH", "/api/v1/courses/\(id)", patch)
            self.plannerChanged()
        }
    }

    func removeCourse(_ id: String) {
        guard let i = snapshot?.coursePlan.firstIndex(where: { $0.id == id }) else { return }
        let removed = snapshot!.coursePlan.remove(at: i)
        mutate(rollback: { $0.coursePlan.insert(removed, at: min(i, $0.coursePlan.count)) }) {
            try await self.api.perform("DELETE", "/api/v1/courses/\(id)")
            self.plannerChanged()
        }
    }

    // MARK: Activities

    /// The student's ranking where they've given one, entry order until
    /// then — orderActivities() in lib/packet.ts.
    var orderedActivities: [Activity] {
        let all = snapshot?.activities ?? []
        return all.enumerated().sorted { a, b in
            switch (a.element.position, b.element.position) {
            case let (x?, y?): return x < y
            case (_?, nil): return true
            case (nil, _?): return false
            default: return a.offset < b.offset
            }
        }.map(\.element)
    }

    func addActivity(name: String, role: String) async {
        struct Body: Encodable { let name: String; let role: String }
        do {
            let created: CreatedID = try await api.post("/api/v1/activities", Body(name: name, role: role))
            snapshot?.activities.append(Activity(id: created.id, name: name, role: role, hoursPerWeek: 2,
                                                 weeksPerYear: 30, description: "", yearsInvolved: [],
                                                 leadership: false, position: nil))
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Writes immediately for toggles; descriptions call this on commit,
    /// not per keystroke.
    func updateActivity(_ id: String, _ change: (inout Activity) -> Void) {
        guard let i = snapshot?.activities.firstIndex(where: { $0.id == id }) else { return }
        let before = snapshot!.activities[i]
        var after = before
        change(&after)
        guard after != before else { return }
        snapshot!.activities[i] = after

        struct Patch: Encodable {
            let name: String?, role: String?, description: String?
            let hoursPerWeek: Double?, weeksPerYear: Double?, leadership: Bool?, yearsInvolved: [Int]?
        }
        let patch = Patch(
            name: after.name != before.name ? after.name : nil,
            role: after.role != before.role ? after.role : nil,
            description: after.description != before.description ? after.description : nil,
            hoursPerWeek: after.hoursPerWeek != before.hoursPerWeek ? after.hoursPerWeek : nil,
            weeksPerYear: after.weeksPerYear != before.weeksPerYear ? after.weeksPerYear : nil,
            leadership: after.leadership != before.leadership ? after.leadership : nil,
            yearsInvolved: after.yearsInvolved != before.yearsInvolved ? after.yearsInvolved : nil)
        mutate(rollback: { snap in
            if let j = snap.activities.firstIndex(where: { $0.id == id }) { snap.activities[j] = before }
        }) {
            try await self.api.perform("PATCH", "/api/v1/activities/\(id)", patch)
        }
    }

    func moveActivity(_ id: String, by offset: Int) {
        var ordered = orderedActivities
        guard let from = ordered.firstIndex(where: { $0.id == id }) else { return }
        let to = from + offset
        guard ordered.indices.contains(to) else { return }
        ordered.swapAt(from, to)

        let before = snapshot!.activities
        for (rank, a) in ordered.enumerated() {
            if let j = snapshot!.activities.firstIndex(where: { $0.id == a.id }) { snapshot!.activities[j].position = rank + 1 }
        }
        struct Body: Encodable { let ids: [String] }
        let ids = ordered.map(\.id)
        mutate(rollback: { $0.activities = before }) {
            try await self.api.perform("POST", "/api/v1/activities/order", Body(ids: ids))
        }
    }

    func removeActivity(_ id: String) {
        guard let i = snapshot?.activities.firstIndex(where: { $0.id == id }) else { return }
        let removed = snapshot!.activities.remove(at: i)
        mutate(rollback: { $0.activities.insert(removed, at: min(i, $0.activities.count)) }) {
            try await self.api.perform("DELETE", "/api/v1/activities/\(id)")
        }
    }

    // MARK: Transcripts

    func uploadTranscript(data: Data, filename: String, mimeType: String) async throws -> TranscriptFile {
        let file: TranscriptFile = try await api.upload("/api/transcript", data: data,
                                                        filename: filename, mimeType: mimeType)
        snapshot?.transcripts.insert(file, at: 0)
        return file
    }

    func readTranscript(_ id: String) async throws -> TranscriptReading {
        struct Body: Encodable { let force: Bool }
        let reading: TranscriptReading = try await api.post("/api/v1/transcripts/\(id)/read", Body(force: true))
        if reading.ok, let i = snapshot?.transcripts.firstIndex(where: { $0.id == id }) {
            snapshot!.transcripts[i].courseCount = reading.courses?.count
            snapshot!.transcripts[i].reportedGpa = reading.reportedGpa
            plannerChanged()
        }
        return reading
    }

    func addExtractedCourses(_ courses: [ExtractedCourse]) async throws -> AddCoursesResult {
        struct Body: Encodable { let courses: [ExtractedCourse] }
        let result: AddCoursesResult = try await api.post("/api/v1/transcripts/courses", Body(courses: courses))
        if result.ok, let added = result.added { snapshot?.coursePlan.append(contentsOf: added); plannerChanged() }
        return result
    }

    func removeTranscript(_ id: String) {
        guard let i = snapshot?.transcripts.firstIndex(where: { $0.id == id }) else { return }
        let removed = snapshot!.transcripts.remove(at: i)
        mutate(rollback: { $0.transcripts.insert(removed, at: min(i, $0.transcripts.count)) }) {
            try await self.api.perform("DELETE", "/api/v1/transcripts/\(id)")
            self.plannerChanged()
        }
    }

    /// The GPA and rigor numbers are the server's arithmetic; tell the
    /// planner to fetch them again after anything that moves them.
    func plannerChanged() {
        plannerRevision += 1
    }
}
