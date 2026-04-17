import { describe, test, expect, beforeEach } from "bun:test"
import { Calibration } from "../../src/socratic/calibration"
import { SocraticDB } from "../../src/socratic/db"
import { resetSocraticDB } from "./_helpers"

beforeEach(() => {
  resetSocraticDB()
})

describe("Calibration.parseCalibrationResponse", () => {
  test("parses numeric response", () => {
    expect(Calibration.parseCalibrationResponse("3")).toBe(3)
    expect(Calibration.parseCalibrationResponse("5")).toBe(5)
  })

  test("parses Spanish names", () => {
    expect(Calibration.parseCalibrationResponse("novato")).toBe(1)
    expect(Calibration.parseCalibrationResponse("básico")).toBe(2)
    expect(Calibration.parseCalibrationResponse("intermedio")).toBe(3)
    expect(Calibration.parseCalibrationResponse("avanzado")).toBe(4)
    expect(Calibration.parseCalibrationResponse("experto")).toBe(5)
  })

  test("parses English names", () => {
    expect(Calibration.parseCalibrationResponse("beginner")).toBe(1)
    expect(Calibration.parseCalibrationResponse("intermediate")).toBe(3)
    expect(Calibration.parseCalibrationResponse("expert")).toBe(5)
  })

  test("returns null on invalid input", () => {
    expect(Calibration.parseCalibrationResponse("hola")).toBe(null)
    expect(Calibration.parseCalibrationResponse("7")).toBe(null)
    expect(Calibration.parseCalibrationResponse("")).toBe(null)
  })
})

describe("Calibration.isCalibrated / completeInitialCalibration", () => {
  test("empty DB → not calibrated", () => {
    expect(Calibration.isCalibrated()).toBe(false)
  })

  test("completeInitialCalibration sets level and flag", () => {
    Calibration.completeInitialCalibration(3)
    expect(Calibration.isCalibrated()).toBe(true)
    expect(SocraticDB.getProfile()!.global_level).toBe(3)
  })
})

describe("Calibration.getState", () => {
  test("no profile → ensures one and returns state", () => {
    const s = Calibration.getState("hola")
    expect(s.globalLevel).toBeGreaterThanOrEqual(1)
    expect(s.mode).toBe("learn")
    expect(s.isCalibrated).toBe(false)
  })

  test("detects domain from message", () => {
    Calibration.completeInitialCalibration(3)
    const s = Calibration.getState("explica useState en react")
    expect(s.currentDomain).toBe("web")
  })
})

describe("Calibration.domainNeedsCalibration + calibrateDomain", () => {
  test("new domain needs calibration", () => {
    expect(Calibration.domainNeedsCalibration("web")).toBe(true)
  })

  test("after calibrateDomain, no longer needs calibration", () => {
    Calibration.calibrateDomain("web", 4)
    expect(Calibration.domainNeedsCalibration("web")).toBe(false)
    const d = SocraticDB.getDomainLevel("web")!
    expect(d.level).toBe(4)
  })
})

describe("Calibration.analyzeTurn", () => {
  test("detects zero-knowledge", () => {
    const a = Calibration.analyzeTurn("no sé qué es eso", 30, 2)
    expect(a.zeroKnowledgeCount).toBeGreaterThan(0)
  })

  test("detects slow-down request", () => {
    const a = Calibration.analyzeTurn("más lento por favor", 30, 2)
    expect(a.slowDownRequested).toBe(true)
  })

  test("detects domain", () => {
    const a = Calibration.analyzeTurn("cómo hago rebase en git", 30, 3)
    expect(a.domain).toBe("infraestructura")
  })
})

describe("Calibration.setManualLevel + override lifecycle", () => {
  test("setManualLevel sets override and activates", () => {
    Calibration.setManualLevel(4)
    expect(Calibration.isOverrideActive()).toBe(true)
    expect(SocraticDB.getProfile()!.global_level).toBe(4)
  })

  test("incrementOverrideCounter expires after 5 sessions", () => {
    Calibration.setManualLevel(4)
    for (let i = 0; i < 4; i++) Calibration.incrementOverrideCounter()
    expect(Calibration.isOverrideActive()).toBe(true)
    Calibration.incrementOverrideCounter() // 5th increment expires it
    expect(Calibration.isOverrideActive()).toBe(false)
  })

  test("no override → isOverrideActive=false", () => {
    SocraticDB.ensureProfile()
    expect(Calibration.isOverrideActive()).toBe(false)
  })
})

describe("Calibration.applyContinuousCalibration", () => {
  test("updates comprehension_speed on mostly-correct", () => {
    Calibration.completeInitialCalibration(3)
    const before = SocraticDB.getProfile()!.comprehension_speed
    Calibration.applyContinuousCalibration(
      {
        correctAnswers: 3,
        incorrectAnswers: 0,
        zeroKnowledgeSignals: 0,
        technicalTermsUsed: true,
        proposedSolutionWithoutHelp: false,
        requestedSlowDown: false,
        copyPasteDetected: false,
      },
      null,
    )
    const after = SocraticDB.getProfile()!.comprehension_speed
    expect(after).toBeGreaterThan(before)
  })

  test("level up writes new global level when no domain", () => {
    Calibration.completeInitialCalibration(2)
    const r = Calibration.applyContinuousCalibration(
      {
        correctAnswers: 3,
        incorrectAnswers: 0,
        zeroKnowledgeSignals: 0,
        technicalTermsUsed: true,
        proposedSolutionWithoutHelp: true,
        requestedSlowDown: false,
        copyPasteDetected: false,
      },
      null,
    )
    expect(r.changed).toBe(true)
    expect(SocraticDB.getProfile()!.global_level).toBe(3)
  })

  test("level adjustment on domain writes domain level only", () => {
    Calibration.completeInitialCalibration(2)
    Calibration.calibrateDomain("web", 2)
    Calibration.applyContinuousCalibration(
      {
        correctAnswers: 3,
        incorrectAnswers: 0,
        zeroKnowledgeSignals: 0,
        technicalTermsUsed: true,
        proposedSolutionWithoutHelp: true,
        requestedSlowDown: false,
        copyPasteDetected: false,
      },
      "web",
    )
    expect(SocraticDB.getDomainLevel("web")!.level).toBe(3)
    // Global level unchanged
    expect(SocraticDB.getProfile()!.global_level).toBe(2)
  })
})
