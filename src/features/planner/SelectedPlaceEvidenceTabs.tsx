import { useRef, type KeyboardEvent } from "react";
import { useI18n } from "../../i18n/useI18n";
import {
  selectedPlaceEvidenceViews,
  selectedPlacePanelId,
  selectedPlaceTabId,
  type SelectedPlaceEvidenceView,
} from "./selected-place-evidence";

type SelectedPlaceEvidenceTabsProps = {
  activeView: SelectedPlaceEvidenceView;
  onChange: (view: SelectedPlaceEvidenceView) => void;
};

export function SelectedPlaceEvidenceTabs({
  activeView,
  onChange,
}: SelectedPlaceEvidenceTabsProps) {
  const { t } = useI18n();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveTo = (index: number) => {
    const wrappedIndex =
      (index + selectedPlaceEvidenceViews.length) %
      selectedPlaceEvidenceViews.length;
    const view = selectedPlaceEvidenceViews[wrappedIndex];
    onChange(view);
    tabRefs.current[wrappedIndex]?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTo(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTo(index + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(selectedPlaceEvidenceViews.length - 1);
    }
  };

  return (
    <div
      className="detail-evidence-tabs"
      role="tablist"
      aria-label={t("detail.evidenceNavigation")}
    >
      {selectedPlaceEvidenceViews.map((view, index) => {
        const isActive = view === activeView;
        return (
          <button
            key={view}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={selectedPlaceTabId(view)}
            type="button"
            role="tab"
            aria-controls={selectedPlacePanelId(view)}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(view)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {t(`detail.evidence.${view}`)}
          </button>
        );
      })}
    </div>
  );
}
