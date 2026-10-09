import SwiftUI
import UIKit
import CoreText

/*
  One fixed palette — "Teal": calm and focused, progress-oriented rather
  than alarm-oriented. Six colours, and every token below is one of them or
  a lighter or darker step of one, so the app reads as a single system:

    Background #F5F5F5   Card   #FFFFFF   Ink  #16201F
    Secondary  #76817F   Accent #16897D   Tint #CDEBE6

  The background and the greys built from it are true neutrals: the
  palette's #F0F3F2 read faintly teal across a whole screen, and the teal
  belongs to the accent and tint alone.

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

    static let paper = Color(hex: 0xF5F5F5)       // Background
    static let surface = Color.white              // Card
    static let ink = Color(hex: 0x16201F)         // Ink
    static let grayStrong = Color(hex: 0x76817F)  // Secondary
    static let grayMid = Color(hex: 0x9AA4A2)     // Secondary, lighter: hints, placeholders
    static let hairline = Color(hex: 0xE3E3E3)    // Background, darker: rules and borders
    static let fill = Color(hex: 0xEDEDED)        // Background, a step darker: wells, bubbles

    // `.accent` (#16897D) is generated from AccentColor in the asset catalog.
    // Text and icons sitting on it are white.

    /*
      A card on the background is white or Tint — nothing in between. The
      lighter teal and the near-grey that used to tint cards all but
      vanished against the grey page; anything paler than Tint belongs
      inside a card, never on the page:
        lavender   — the counselor speaking (why it fits, nudges, picks): Tint
        surface    — everything else on the page: facts, things to act on
        highlight  — the one thing that matters most on a screen: Tint,
                     used sparingly or it stops meaning anything
        mist       — inside a card: tiles, wells, icon circles
      The names are older than the palette; the roles are what they keep.
    */
    static let mist = Color(hex: 0xEDEDED)
    static let mistStrong = Color(hex: 0xD4D4D4)
    static let lavender = Color(hex: 0xCDEBE6)    // Tint
    static let lavenderStrong = Color(hex: 0xA9DAD1)
    static let highlight = Color(hex: 0xCDEBE6)   // Tint
    static let highlightSoft = Color(hex: 0xCDEBE6)
    static let accentSoft = Color(hex: 0xCDEBE6)

    // Chance tiers — muted, non-alarming. Never traffic lights: three steps
    // of the palette, from Secondary through a deep teal to Accent.
    static let reach = Color(hex: 0x76817F)
    static let reachSoft = Color(hex: 0xEDEDED)
    static let target = Color(hex: 0x3E6B66)
    static let targetSoft = Color(hex: 0xDDE8E6)
    static let likely = Color(hex: 0x16897D)
    static let likelySoft = Color(hex: 0xE3F3F0)
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
