import SwiftUI
import UIKit
import CoreText

/*
  The tokens from app/globals.css. Swiss / editorial: near-white paper,
  near-black ink, grays doing the work, one accent (deep ink blue).
  Type is the system face rather than Inter — on iOS, SF is what reads as
  native, and the editorial feel comes from weight and tracking, not the
  font file.
*/

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }

    // A true neutral — the earlier #F5F6F4 read faintly green.
    static let paper = Color(hex: 0xF5F5F5)
    static let surface = Color.white
    static let ink = Color(hex: 0x111111)
    static let grayStrong = Color(hex: 0x6B6B6B)
    static let grayMid = Color(hex: 0x9A9A9A)
    static let hairline = Color(hex: 0xE5E5E5)
    static let fill = Color(hex: 0xF1F1F0)

    // `.accent` (#1B3A6B) is generated from AccentColor in the asset catalog.

    /*
      Surfaces that say what kind of content sits on them — the idea taken
      from the RentEase reference. Sections are told apart by tint, not by
      hairlines:
        lavender   — the counselor speaking (why it fits, nudges, picks)
        mist       — facts and figures about a school or the student
        surface    — something to act on (an application, a course)
        highlight  — the one thing that matters most on a screen; used
                     sparingly or it stops meaning anything
    */
    static let mist = Color(hex: 0xE3EBE8)
    static let mistStrong = Color(hex: 0xC6D6D2)
    static let lavender = Color(hex: 0xE9E6F5)
    static let lavenderStrong = Color(hex: 0xCFC9EA)
    static let highlight = Color(hex: 0xEEF27A)
    static let highlightSoft = Color(hex: 0xF6F8C8)
    static let accentSoft = Color(hex: 0xEEF2F8)

    // Chance tiers — muted, non-alarming. Never traffic lights.
    static let reach = Color(hex: 0x6E7B8C)
    static let reachSoft = Color(hex: 0xEEF1F4)
    static let target = Color(hex: 0x5F7D64)
    static let targetSoft = Color(hex: 0xEEF3EF)
    static let likely = Color(hex: 0xA08653)
    static let likelySoft = Color(hex: 0xF6F1E7)
}

extension ChanceTier {
    var color: Color {
        switch self {
        case .reach: .reach
        case .target: .target
        case .likely: .likely
        }
    }

    var softColor: Color {
        switch self {
        case .reach: .reachSoft
        case .target: .targetSoft
        case .likely: .likelySoft
        }
    }
}

extension Font {
    static let headline1 = Font.display(30)
    static let body17 = Font.system(size: 17)

    /// Raleway, for headlines and section titles. Body copy, numbers in
    /// tiles and anything dense stay on the system face, where legibility
    /// matters more than voice.
    ///
    /// The bundled file is Raleway's variable font, whose default instance
    /// is Thin, so the weight is set on the `wght` axis directly. Lining
    /// figures are switched on: Raleway's default old-style numerals make
    /// "1,585 schools" bounce up and down the baseline.
    static func display(_ size: CGFloat, weight: CGFloat = 760) -> Font {
        let wght = 0x7767_6874 // 'wght'
        let descriptor = UIFontDescriptor(fontAttributes: [
            .name: "Raleway-Thin",
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [wght: weight],
            .featureSettings: [[
                UIFontDescriptor.FeatureKey.type: kNumberCaseType,
                UIFontDescriptor.FeatureKey.selector: kUpperCaseNumbersSelector,
            ]],
        ])
        return Font(UIFont(descriptor: descriptor, size: size))
    }
}
