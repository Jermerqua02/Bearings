import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

/// Upload a transcript, have it read, confirm what it found — the web's
/// TranscriptPanel. The middle step is the point: a model reading a scan
/// gets things wrong, and what it writes into is the student's academic
/// record, so nothing lands until they've checked it.
struct TranscriptPanel: View {
    @Environment(AppModel.self) private var model
    @State private var busy: Busy?
    @State private var error: String?
    @State private var status: String?
    @State private var reading: Reading?
    @State private var importing = false
    @State private var photo: PhotosPickerItem?

    enum Busy { case uploading, reading, adding }

    struct Reading: Identifiable {
        let id: String // transcript id
        let courses: [ExtractedCourse]
        let notes: [String]
    }

    var body: some View {
        Panel(icon: "doc.viewfinder", title: "Your transcript", subtitle: "Read your courses in, instead of typing them", tint: .surface) {
            Muted("Upload it and we'll read the coursework onto this page, so you aren't typing four years of classes by hand. The file stays here — yours to download whenever you need it, and never shown to a linked parent.", size: 14)

            HStack(spacing: 10) {
                Button { importing = true } label: {
                    Label(busy == .uploading ? "Uploading…" : busy == .reading ? "Reading…" : "Upload a PDF", systemImage: "doc")
                }
                .buttonStyle(InkButtonStyle(compact: true))
                PhotosPicker(selection: $photo, matching: .images) { Label("Photo", systemImage: "camera") }
                    .buttonStyle(OutlineButtonStyle(compact: true))
            }
            .disabled(busy != nil)
            Text("PDF or a photo, up to 15 MB").font(.system(size: 12)).foregroundStyle(Color.grayMid)

            if let error { InlineNote(text: error, kind: .problem) }
            if let status { InlineNote(text: status, kind: .ok) }

            let files = model.snapshot?.transcripts ?? []
            if !files.isEmpty {
                VStack(spacing: 0) {
                    ForEach(files) { t in
                        Divider().overlay(Color.hairline)
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.filename).font(.system(size: 14, weight: .medium)).lineLimit(1)
                                Text("\(Format.bytes(t.sizeBytes)) · \(t.courseCount.map { "\($0) courses read" } ?? "not read yet")")
                                    .font(.system(size: 12)).foregroundStyle(Color.grayMid)
                            }
                            Spacer()
                            Menu {
                                Button(t.courseCount != nil ? "Read again" : "Read it") { Task { await read(t.id) } }
                                Button("Remove", role: .destructive) {
                                    model.removeTranscript(t.id)
                                    if reading?.id == t.id { reading = nil }
                                }
                            } label: {
                                Image(systemName: "ellipsis").foregroundStyle(Color.grayMid).frame(width: 32, height: 32)
                            }
                            .disabled(busy != nil)
                            .accessibilityLabel("More for \(t.filename)")
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .png, .jpeg]) { result in
            guard case .success(let url) = result else { return }
            Task { await uploadFile(url) }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            photo = nil
            Task { await uploadPhoto(item) }
        }
        .sheet(item: $reading) { r in
            ReviewSheet(reading: r) { chosen in
                Task { await add(chosen) }
            }
            .presentationBackground(Color.paper)
        }
    }

    // MARK: Steps

    private func uploadFile(_ url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { error = "We couldn't open that file."; return }
        let type = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/pdf"
        await upload(data, filename: url.lastPathComponent, mime: type)
    }

    private func uploadPhoto(_ item: PhotosPickerItem) async {
        // Photos arrive as HEIC more often than not, which the reader
        // doesn't take; re-encode as JPEG.
        guard let raw = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: raw), let jpeg = image.jpegData(compressionQuality: 0.85)
        else { error = "We couldn't open that photo."; return }
        await upload(jpeg, filename: "transcript-photo.jpg", mime: "image/jpeg")
    }

    private func upload(_ data: Data, filename: String, mime: String) async {
        busy = .uploading; error = nil; status = nil
        do {
            let file = try await model.uploadTranscript(data: data, filename: filename, mimeType: mime)
            await read(file.id)
        } catch {
            self.error = error.localizedDescription
            busy = nil
        }
    }

    private func read(_ id: String) async {
        busy = .reading; error = nil; status = nil
        defer { busy = nil }
        do {
            let r = try await model.readTranscript(id)
            if !r.ok { error = r.error ?? "We couldn't read that file."; return }
            if r.looksLikeTranscript == false {
                error = "That doesn't look like a transcript. Check you uploaded the right file."
                return
            }
            reading = Reading(id: id, courses: r.courses ?? [], notes: r.notes ?? [])
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func add(_ chosen: [ExtractedCourse]) async {
        reading = nil
        busy = .adding; error = nil
        defer { busy = nil }
        do {
            let result = try await model.addExtractedCourses(chosen)
            if !result.ok { error = result.error ?? "We couldn't add those courses."; return }
            let added = result.added?.count ?? 0
            if added == 0 { status = "Those were all on your plan already — nothing to add."; return }
            // Say that the rigor counts moved — they feed the chance tiers.
            let rigor = result.rigor.map { " Your rigor is now \($0.apCount) AP, \($0.ibCount) IB, \($0.honorsCount) honors — the counselor and your chance estimates use this." } ?? ""
            status = "Added \(added) course\(added == 1 ? "" : "s").\((result.skipped ?? 0) > 0 ? " \(result.skipped!) were already there." : "")\(rigor)"
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Check the reading against the document before anything is added.
private struct ReviewSheet: View {
    @Environment(\.dismiss) private var dismiss
    let reading: TranscriptPanel.Reading
    let add: ([ExtractedCourse]) -> Void
    @State private var picked: Set<Int> = []

    var body: some View {
        NavigationStack {
            Page(spacing: 16) {
                TwoTone(lead: reading.courses.isEmpty ? "We couldn't pick out any courses." : "We read \(reading.courses.count) course\(reading.courses.count == 1 ? "" : "s").",
                        rest: "", size: 24)
                Muted("Check these against the document before adding them — this is your academic record, and a scan is not always read correctly. Untick anything wrong; you can edit or delete any of it afterwards."
                      + (reading.courses.contains { $0.term != nil } ? " A course you took all year appears once per grading period, with that period's own grade — those repeats are what the transcript says, not a mistake." : ""),
                      size: 14)
                ForEach(reading.notes, id: \.self) { Muted("— \($0)", size: 14) }

                if !reading.courses.isEmpty {
                    Button(picked.count == reading.courses.count ? "Untick all" : "Tick all") {
                        picked = picked.count == reading.courses.count ? [] : Set(reading.courses.indices)
                    }
                    .buttonStyle(LinkButtonStyle(color: .grayStrong))

                    VStack(spacing: 0) {
                        ForEach(Array(reading.courses.enumerated()), id: \.offset) { i, c in
                            if i > 0 { Divider().overlay(Color.hairline) }
                            Button {
                                if picked.contains(i) { picked.remove(i) } else { picked.insert(i) }
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: picked.contains(i) ? "checkmark.square.fill" : "square")
                                        .foregroundStyle(picked.contains(i) ? Color.accent : Color.grayMid)
                                        .font(.system(size: 18))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(c.name).font(.system(size: 15)).foregroundStyle(Color.ink)
                                        Text(["\(c.year)th", c.subject.rawValue, c.level.label, c.term,
                                              c.grade ?? "in progress", c.credits.map { "\(Format.gpa($0)) cr" }]
                                            .compactMap { $0 }.joined(separator: " · ").uppercased())
                                            .font(.system(size: 11, weight: .medium)).tracking(0.4).foregroundStyle(Color.grayMid)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(.vertical, 9)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 14)
                    .surfaceCard()
                }
            }
            .navigationTitle("Check the reading")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Not now") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add \(picked.count)") {
                        add(reading.courses.enumerated().filter { picked.contains($0.offset) }.map(\.element))
                    }
                    .fontWeight(.semibold)
                    .disabled(picked.isEmpty)
                }
            }
        }
        .onAppear { picked = Set(reading.courses.indices) }
    }
}
