import XCTest

/// A brand-new student, from the welcome tour to a saved profile, the way
/// a person does it — in the app, with no trip to the website.
///
/// Needs a token for an account with no profile yet, in
/// BEARINGS_UITEST_NEW_TOKEN (see ios/README.md). Each run uses it up: once
/// the profile is saved, the account isn't new any more.
final class OnboardingTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        let token = ProcessInfo.processInfo.environment["BEARINGS_UITEST_NEW_TOKEN"] ?? ""
        try XCTSkipIf(token.isEmpty, "Set BEARINGS_UITEST_NEW_TOKEN to a new account's session token")
        app = XCUIApplication()
        app.launchEnvironment["BEARINGS_DEV_TOKEN"] = token
        app.launch()
    }

    func testNewStudentOnboardsInApp() throws {
        // The tour opens by itself: five pages, then Free and Pro.
        let next = app.buttons["Next"]
        XCTAssertTrue(next.waitForExistence(timeout: 20), "The welcome tour didn't open for a new account")
        for _ in 0..<5 { next.tap() }
        XCTAssertTrue(app.staticTexts["Free gets you started. Pro makes it yours."].waitForExistence(timeout: 5)
                      || app.buttons["See Pro plans"].exists, "The tour didn't end on what Pro adds")
        attach("tour-pro")
        app.buttons["Start my first meeting"].tap()

        let proceed = app.buttons["Continue"]
        func tapContinue() { XCTAssertTrue(proceed.isEnabled); proceed.tap() }

        type("Ava", into: app.textFields["Your first name"]); tapContinue()
        app.buttons["11th grade"].tap(); tapContinue()
        type("3.7", into: app.textFields["3.6"]); tapContinue()
        type("4", into: app.textFields.element(boundBy: 0)); tapContinue()
        app.buttons["Haven't tested yet"].tap(); tapContinue()
        app.buttons["Computer Science"].tap(); tapContinue()
        type("Robotics team, part-time job", into: app.descendants(matching: .any)["onboarding.activities"].firstMatch); tapContinue()
        type("wash", into: app.textFields["Search states"]); app.buttons["Washington"].tap(); tapContinue()
        app.buttons["West"].tap(); tapContinue()
        app.buttons["Urban"].tap(); tapContinue()
        app.buttons["$15k – $30k / year"].tap(); tapContinue()
        app.buttons["Research access"].tap()
        attach("last-question")
        app.buttons["Finish"].tap()

        let done = app.buttons["That's me — let's go"]
        XCTAssertTrue(done.waitForExistence(timeout: 30), "The profile didn't save")
        attach("summary")
        done.tap()

        // Home is personal now, and a Free account is offered the trial.
        XCTAssertTrue(app.staticTexts["Not now"].waitForExistence(timeout: 15) || app.buttons["Not now"].exists,
                      "The trial wasn't offered after onboarding")
        attach("trial")
        app.buttons["Not now"].tap()
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Hi Ava'")).firstMatch.waitForExistence(timeout: 10),
                      "Home didn't greet the new student")
        XCTAssertFalse(app.buttons["Start your first meeting"].exists)
        attach("home")
    }

    private func type(_ text: String, into field: XCUIElement) {
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(text)
    }

    private func attach(_ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }
}
