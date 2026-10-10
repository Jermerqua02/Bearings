import Foundation

/// A failure the user can read. The server writes these messages for
/// display (see lib/api/v1.ts), so they're shown as-is.
struct APIError: LocalizedError {
    let status: Int
    let message: String

    var errorDescription: String? { message }
    var isUnauthorized: Bool { status == 401 }

    static let offline = APIError(status: 0, message: "Can't reach Lumni. Check your connection and try again.")
}

/// HTTP to the Bearings server: /api/v1 for app data, /api/auth for
/// Better Auth's sign-in and sign-out.
///
/// The session lives in a bearer token, never a cookie. Cookies are switched
/// off entirely: Better Auth runs its CSRF origin check on any request that
/// carries one, and a stray cookie from a sign-in response would make every
/// later call fail that check.
final class APIClient {
    static let shared = APIClient()

    /// Called when the server says the token is no longer good, so the app
    /// can drop back to sign-in rather than show a broken screen.
    var onUnauthorized: (() -> Void)?

    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    private init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.httpCookieStorage = nil
        // Counselor replies are a model call; give them room.
        config.timeoutIntervalForRequest = 90
        session = URLSession(configuration: config)
    }

    var token: String? { Keychain.readToken() }

    // MARK: Requests

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try decode(await send("GET", path, query: query, body: nil as Empty?))
    }

    func post<T: Decodable>(_ path: String, _ body: some Encodable = Empty()) async throws -> T {
        try decode(await send("POST", path, body: body))
    }

    /// For endpoints that answer 204.
    func perform(_ method: String, _ path: String, _ body: some Encodable = Empty()) async throws {
        _ = try await send(method, path, body: method == "DELETE" ? nil : body)
    }

    /// Raw bytes, or nil on 404 — for images the app shows itself.
    func data(_ path: String) async throws -> Data? {
        let (data, response) = try await raw("GET", path, body: nil as Empty?, authenticated: true)
        if response.statusCode == 404 { return nil }
        try check(data, response)
        return data
    }

    /// JSON in, raw bytes out — for /api/tts, which answers audio/wav.
    /// `timeout` is for callers with a fallback that beats waiting out the
    /// 90 seconds a counselor reply is allowed.
    func postData(_ path: String, _ body: some Encodable, timeout: TimeInterval? = nil) async throws -> Data {
        let (data, response) = try await raw("POST", path, body: body, authenticated: true, timeout: timeout)
        try check(data, response)
        return data
    }

    /// A file, as multipart/form-data with field "file" — the shape
    /// /api/transcript has always taken from the web.
    func upload<T: Decodable>(_ path: String, data: Data, filename: String, mimeType: String) async throws -> T {
        let boundary = "bearings-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        let safeName = filename.replacingOccurrences(of: "\"", with: "")
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\n".utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        var request = URLRequest(url: Config.apiBaseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        request.httpBody = body

        let (respData, response): (Data, URLResponse)
        do {
            (respData, response) = try await session.data(for: request)
        } catch {
            throw APIError.offline
        }
        try check(respData, response as! HTTPURLResponse)
        return try decode(respData)
    }

    // MARK: Streaming

    /// One server-sent event: its name and its JSON payload.
    struct ServerEvent {
        let name: String
        let data: Data

        func decode<T: Decodable>(_ type: T.Type) -> T? { try? JSONDecoder().decode(type, from: data) }
    }

    /// POST, answered as server-sent events — the counselor's streamed
    /// replies. A failure before the stream opens (signed out, a bad
    /// request) throws the same APIError as any other call.
    func events(_ path: String, _ body: some Encodable) -> AsyncThrowingStream<ServerEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = try makeRequest("POST", path, body: body, authenticated: true)
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let (bytes, response): (URLSession.AsyncBytes, URLResponse)
                    do {
                        (bytes, response) = try await session.bytes(for: request)
                    } catch {
                        throw APIError.offline
                    }
                    let http = response as! HTTPURLResponse
                    guard (200..<300).contains(http.statusCode) else {
                        var data = Data()
                        for try await byte in bytes { data.append(byte) }
                        try check(data, http)
                        return
                    }
                    var name = "message", payload = ""
                    for try await line in bytes.lines {
                        if line.hasPrefix("event:") {
                            name = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                        } else if line.hasPrefix("data:") {
                            payload += line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        }
                        // `lines` drops the blank line that ends an event, so an
                        // event is complete once its data line has arrived —
                        // the server sends exactly one per event.
                        if !payload.isEmpty {
                            continuation.yield(ServerEvent(name: name, data: Data(payload.utf8)))
                            name = "message"; payload = ""
                        }
                    }
                    continuation.finish()
                } catch let error as APIError {
                    continuation.finish(throwing: error)
                } catch {
                    continuation.finish(throwing: Task.isCancelled ? error : APIError.offline)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: Auth

    /// Better Auth answers sign-in with the signed session token in
    /// `set-auth-token` (the bearer plugin). That token is the session.
    func signIn(email: String, password: String) async throws {
        struct Body: Encodable { let email: String; let password: String }
        let (data, response) = try await raw("POST", "/api/auth/sign-in/email",
                                             body: Body(email: email, password: password),
                                             authenticated: false)
        try check(data, response)
        guard let token = response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw APIError(status: 500, message: "Signed in, but the server didn't return a session.")
        }
        Keychain.saveToken(token)
    }

    func signOut() async {
        // Best effort: the server-side session should end, but the local
        // token goes regardless — signing out must always work offline.
        _ = try? await raw("POST", "/api/auth/sign-out", body: Empty(), authenticated: true)
        Keychain.deleteToken()
    }

    // MARK: Plumbing

    struct Empty: Codable {}

    private func send<B: Encodable>(_ method: String, _ path: String,
                                    query: [URLQueryItem] = [], body: B?) async throws -> Data {
        let (data, response) = try await raw(method, path, query: query, body: body, authenticated: true)
        try check(data, response)
        return data
    }

    private func raw<B: Encodable>(_ method: String, _ path: String, query: [URLQueryItem] = [],
                                   body: B?, authenticated: Bool,
                                   timeout: TimeInterval? = nil) async throws -> (Data, HTTPURLResponse) {
        let request = try makeRequest(method, path, query: query, body: body,
                                      authenticated: authenticated, timeout: timeout)
        do {
            let (data, response) = try await session.data(for: request)
            return (data, response as! HTTPURLResponse)
        } catch {
            throw APIError.offline
        }
    }

    private func makeRequest<B: Encodable>(_ method: String, _ path: String, query: [URLQueryItem] = [],
                                           body: B?, authenticated: Bool,
                                           timeout: TimeInterval? = nil) throws -> URLRequest {
        var components = URLComponents(url: Config.apiBaseURL.appending(path: path),
                                       resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let timeout { request.timeoutInterval = timeout }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }
        if authenticated, let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func check(_ data: Data, _ response: HTTPURLResponse) throws {
        guard !(200..<300).contains(response.statusCode) else { return }

        // /api/v1 sends { error }; Better Auth sends { message, code }.
        struct Body: Decodable { let error: String?; let message: String? }
        let parsed = try? decoder.decode(Body.self, from: data)
        let message = parsed?.error ?? parsed?.message ?? "Something went wrong. Please try again."
        let error = APIError(status: response.statusCode, message: message)

        if error.isUnauthorized { onUnauthorized?() }
        throw error
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("[api] decode \(T.self) failed:", error)
            #endif
            throw APIError(status: 0, message: "Lumni sent something this version of the app can't read. Try updating.")
        }
    }
}
