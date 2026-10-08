import SwiftUI

/// Interview practice — app/(app)/interviews/page.tsx, inside the
/// counselor. Practice is kept per school, so picking a school picks up
/// where the student left off.
struct InterviewView: View {
    @Environment(AppModel.self) private var model
    @State private var state: InterviewState?
    @State private var schoolId = ""
    @State private var question = ""
    @State private var answer = ""
    @State private var turns: [InterviewTurn] = []
    @State private var busy = false
    @State private var error: String?
    @AppStorage("interviewPrimerHidden") private var primerHidden = false

    var body: some View {
        Page(spacing: 22) {
            TwoTone(lead: "Practice the conversation", rest: "before it counts.")

            if !primerHidden {
                CardView {
                    HStack(alignment: .firstTextBaseline) {
                        SectionLabel("What interviews are actually for")
                        Spacer()
                        Button("Hide") { primerHidden = true }.font(.system(size: 13)).foregroundStyle(Color.grayMid)
                    }
                    Muted("Most students think an interview is an oral exam. It isn't. At nearly every school it's a low-stakes conversation, often with an alum, that answers one question: is this a real person who would be good to have around?")
                    Muted("A great interview isn't polished — it's specific. One real story about your robotics team beats five rehearsed paragraphs about leadership. Interviews rarely rescue or sink an application; mostly they confirm the person on paper exists. So your job is simple: be that person, out loud.")
                }
            }

            if let state {
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Practice for")
                    SelectBox(options: [("", "General practice")] + state.schools.map { ($0.id, $0.name) },
                              selection: $schoolId)
                }
                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Question")
                    SelectBox(options: ([question] + state.questions.filter { $0 != question }).map { ($0, $0) },
                              selection: $question)
                }
            }

            ForEach(turns) { turn in
                VStack(alignment: .leading, spacing: 10) {
                    Text(turn.question).font(.system(size: 16, weight: .medium))
                    Text(turn.answer).font(.system(size: 15)).foregroundStyle(Color.grayStrong)
                        .padding(.leading, 12)
                        .overlay(alignment: .leading) { Rectangle().fill(Color.hairline).frame(width: 2) }
                    CardView {
                        SectionLabel("Working", color: .target)
                        ForEach(turn.feedback.strengths, id: \.self) { Text("— \($0)").font(.system(size: 15)) }
                        SectionLabel("To work on").padding(.top, 4)
                        ForEach(turn.feedback.toWorkOn, id: \.self) { Text("— \($0)").font(.system(size: 15)) }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 12) {
                Text(question).font(.system(size: 18, weight: .semibold))
                TextArea(placeholder: "Answer as if you're speaking. Don't polish — talk.", text: $answer, minLines: 5)
                if let error { InlineNote(text: error, kind: .problem) }
                Button(busy ? "Listening…" : "Get feedback") { Task { await submit() } }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(busy || answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .navigationTitle("Interview practice")
        .navigationBarTitleDisplayMode(.inline)
        .paperChrome()
        .task(id: schoolId) { await load() }
    }

    private func load() async {
        do {
            let query = schoolId.isEmpty ? [] : [URLQueryItem(name: "schoolId", value: schoolId)]
            let s: InterviewState = try await model.api.get("/api/v1/interviews", query: query)
            state = s
            turns = s.turns
            if question.isEmpty { question = s.questions.first ?? "Tell me about yourself." }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func submit() async {
        struct Body: Encodable { let schoolId: String?; let question: String; let answer: String }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let fb: InterviewFeedback = try await model.api.post("/api/v1/interviews",
                Body(schoolId: schoolId.isEmpty ? nil : schoolId, question: question, answer: answer))
            turns.append(InterviewTurn(question: question, answer: answer, feedback: fb))
            answer = ""
            // The counselor's follow-up names the next question in quotes.
            if let next = fb.followUp.firstMatch(of: /"([^"]+)"/)?.1 { question = String(next) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
