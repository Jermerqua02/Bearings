import XCTest

/// A parent, linked to a student, the way a person uses it: their own
/// counselor with a parent's questions, Explore with their student's
/// chances, a list of their own apart from the student's, and a You page.
///
/// Needs a token for a parent who has onboarded and is linked to a student
/// with Pro (it's shared across the link), in BEARINGS_UITEST_PARENT_TOKEN,
/// and the student's first name in BEARINGS_UITEST_STUDENT_NAME (see
/// ios/README.md).
final class ParentTests: XCTestCase {
    private var app: XCUIApplication!
    private var student = ""

    /// Starters.parent, so the test knows a parent's question when it sees one.
    private let parentQuestions: Set<String> = [
        "How do we figure out what we'd really pay?", "What's the difference between sticker price and net price?",
        "When should we fill out the FAFSA, and what do we need?", "What's the CSS Profile, and do we need it?",
        "How does having two kids in college at once change aid?", "Is a more expensive school ever worth it?",
        "How much should we borrow, if anything?", "How do merit scholarships work?",
        "Can we appeal a financial aid offer?", "What does in-state tuition mean for us?",
        "What should we be doing this season?", "When should we start visiting colleges?",
        "What deadlines should be on our family calendar?", "What happens between applying and decision day?",
        "How can I help without taking over?", "How involved should I be in the essays?",
        "My student seems stressed. What's normal?", "How do I bring up money without crushing their hopes?",
        "We disagree about where they should apply. Now what?",
        "My student doesn't know what they want to study. Should I worry?",
        "How do I talk about schools that are far from home?", "Is my student's list realistic?",
        "What makes a good safety school?", "Explain early decision vs. early action for parents",
        "What should we look for on a campus visit?", "How do we compare offers when they come in?",
        "Does it matter where they go to college?", "Is community college then transferring a good path?",
        "What's a gap year, and is it a good idea?",
    ]

    override func setUpWithError() throws {
        continueAfterFailure = false
        let env = ProcessInfo.processInfo.environment
        let token = env["BEARINGS_UITEST_PARENT_TOKEN"] ?? ""
        student = env["BEARINGS_UITEST_STUDENT_NAME"] ?? ""
        try XCTSkipIf(token.isEmpty || student.isEmpty,
                      "Set BEARINGS_UITEST_PARENT_TOKEN and BEARINGS_UITEST_STUDENT_NAME")
        app = XCUIApplication()
        app.launchEnvironment["BEARINGS_DEV_TOKEN"] = token
        app.launch()
    }

    func testParentHasTheirOwnCounselor() throws {
        XCTAssertTrue(app.buttons["Ask me anything"].waitForExistence(timeout: 20), "Parent Home has no way to the counselor")
        app.buttons["nav.counselor"].tap()
        XCTAssertTrue(app.staticTexts["START WITH"].waitForExistence(timeout: 10), "The counselor didn't open for a parent")
        let shown = app.buttons.allElementsBoundByIndex.map(\.label).filter { parentQuestions.contains($0) }
        XCTAssertEqual(shown.count, 4, "Expected four parent starters, saw \(shown)")
        XCTAssertFalse(app.staticTexts["Practice an interview"].exists, "Interview practice is the student's")
        attach("parent-counselor")
    }

    func testParentExploresAndKeepsTheirOwnList() throws {
        tapTab("explore")
        let first = app.buttons.matching(identifier: "explore.result").firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 20), "A parent should see Explore results")
        XCTAssertTrue(app.staticTexts["\(student):"].firstMatch.waitForExistence(timeout: 5),
                      "Chances should be labelled as the student's")
        attach("parent-explore")

        // Save the first school that isn't saved yet, to the parent's own list.
        let add = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Add ' AND label ENDSWITH ' to your list'")).firstMatch
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        let name = add.label.replacingOccurrences(of: "Add ", with: "").replacingOccurrences(of: " to your list", with: "")
        add.tap()

        tapTab("apply")
        XCTAssertTrue(app.buttons["\(student)'s list"].waitForExistence(timeout: 10), "A linked parent should see both lists")
        app.buttons["My list"].tap()
        let row = app.descendants(matching: .any).matching(identifier: "ownlist.row")
            .containing(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10) || app.staticTexts[name].exists, "\(name) didn't land on the parent's own list")
        attach("parent-my-list")

        // Not on the student's: that list is theirs.
        app.buttons["\(student)'s list"].tap()
        XCTAssertFalse(app.staticTexts[name].waitForExistence(timeout: 3), "The parent's save leaked onto the student's list")

        // Tidy up so the next run starts the same way.
        app.buttons["My list"].tap()
        let remove = app.buttons["Remove \(name) from your list"]
        if remove.waitForExistence(timeout: 5) { remove.tap() }
    }

    func testParentHasAYouPage() throws {
        tapTab("home")
        let profile = app.buttons["Your profile and settings"]
        XCTAssertTrue(profile.waitForExistence(timeout: 20))
        profile.tap()
        let you = app.buttons.containing(NSPredicate(format: "label CONTAINS 'about you and your family'")).firstMatch
        XCTAssertTrue(you.waitForExistence(timeout: 10), "Settings has no You card for a parent")
        you.tap()
        XCTAssertTrue(app.staticTexts["What I know about you"].waitForExistence(timeout: 10), "The parent's You page didn't open")
        XCTAssertTrue(app.staticTexts["Money & aid"].waitForExistence(timeout: 10), "Expected a parent's topics")
        attach("parent-you")
    }

    private func tapTab(_ name: String) {
        let expand = app.buttons["nav.expand"]
        if expand.exists { expand.tap() }
        let tab = app.buttons["nav.\(name)"]
        XCTAssertTrue(tab.waitForExistence(timeout: 10), "No \(name) tab")
        tab.tap()
    }

    private func attach(_ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }
}
