import type { ReactElement } from "react";
import { t } from "../i18n";
import type { AppLanguage } from "../types";
import type { OnboardingGuideVariant } from "./onboarding";

interface OnboardingCardProps {
  language: AppLanguage;
  variant: OnboardingGuideVariant;
  onDismiss(this: void): void;
}

const copyKeys: Record<OnboardingGuideVariant, { title: Parameters<typeof t>[1]; body: Parameters<typeof t>[1] }> = {
  ask: {
    title: "onboardingAskTitle",
    body: "onboardingAskBody",
  },
  branch: {
    title: "onboardingBranchTitle",
    body: "onboardingBranchBody",
  },
  child: {
    title: "onboardingChildTitle",
    body: "onboardingChildBody",
  },
  done: {
    title: "onboardingDoneTitle",
    body: "onboardingDoneBody",
  },
};

export function OnboardingCard({ language, variant, onDismiss }: OnboardingCardProps): ReactElement {
  const copy = copyKeys[variant];

  return (
    <aside className={`bcm-onboarding-card bcm-onboarding-${variant}`} aria-label={t(language, "onboardingCardLabel")}>
      <div className="bcm-onboarding-copy">
        <div className="bcm-onboarding-title">{t(language, copy.title)}</div>
        <div className="bcm-onboarding-body">{t(language, copy.body)}</div>
      </div>
      {variant === "branch" ? <kbd className="bcm-onboarding-key">Tab</kbd> : null}
      {variant === "done" ? (
        <button className="bcm-onboarding-finish" type="button" onClick={onDismiss}>
          {t(language, "onboardingFinishButton")}
        </button>
      ) : null}
      <button
        className="bcm-onboarding-dismiss"
        type="button"
        onClick={onDismiss}
        aria-label={t(language, "onboardingDismiss")}
        title={t(language, "onboardingDismiss")}
      >
        ×
      </button>
    </aside>
  );
}
