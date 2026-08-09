import type { ReactNode } from "react";
import type { MessageKey, MessageValues } from "../../i18n/messages";
import {
  ECLIPSE_ATLAS_REPOSITORY_URL,
  GitHubMark,
} from "./GitHubMark";

type Translate = (key: MessageKey, values?: MessageValues) => string;

function HelpSectionIcon({ kind }: { kind: "map" | "data" | "sources" | "about" }) {
  if (kind === "map") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3.5 6 5-2.5 7 2.5 5-2.5v14.5l-5 2.5-7-2.5-5 2.5z" />
        <path d="M8.5 3.5v14.5M15.5 6v14.5" />
      </svg>
    );
  }

  if (kind === "data") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 18.5h16M6.5 15v-4M12 15V6M17.5 15V9" />
      </svg>
    );
  }

  if (kind === "sources") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3.5h8l4 4v13H6z" />
        <path d="M14 3.5v4h4M9 12h6M9 16h6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.8v5.1M12 7.7h.01" />
    </svg>
  );
}

function HelpSection({
  kind,
  title,
  summary,
  children,
}: {
  kind: "map" | "data" | "sources" | "about";
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="help-section">
      <summary>
        <HelpSectionIcon kind={kind} />
        <span>
          <b>{title}</b>
          <small>{summary}</small>
        </span>
        <i aria-hidden="true" />
      </summary>
      <div className="help-section__body">{children}</div>
    </details>
  );
}

export function HelpPanel({
  onClose,
  t,
}: {
  onClose: () => void;
  t: Translate;
}) {
  const baseUrl = import.meta.env.BASE_URL;

  return (
    <section className="help-panel" aria-labelledby="help-title" tabIndex={-1}>
      <header>
        <span>{t("help.eyebrow")}</span>
        <h2 id="help-title">{t("help.title")}</h2>
        <p>{t("help.introduction")}</p>
      </header>

      <div className="help-sections">
        <HelpSection
          kind="map"
          title={t("help.map.title")}
          summary={t("help.map.summary")}
        >
          <p>{t("help.map.body")}</p>
          <p>{t("help.map.baseBody")}</p>
        </HelpSection>

        <HelpSection
          kind="data"
          title={t("help.data.title")}
          summary={t("help.data.summary")}
        >
          <p>{t("help.data.body")}</p>
        </HelpSection>

        <HelpSection
          kind="sources"
          title={t("help.sources.title")}
          summary={t("help.sources.summary")}
        >
          <p>{t("help.sources.body")}</p>
          <div className="help-links">
            <a href={`${baseUrl}sources.json`}>{t("footer.sources")}</a>
            <a href={`${baseUrl}third-party-notices.txt`}>
              {t("footer.notices")}
            </a>
          </div>
        </HelpSection>

        <HelpSection
          kind="about"
          title={t("help.about.title")}
          summary={t("help.about.summary")}
        >
          <p>{t("help.about.body")}</p>
          <a
            className="help-repository-link"
            href={ECLIPSE_ATLAS_REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
          >
            <GitHubMark />
            <span>{t("repository.viewSource")}</span>
          </a>
        </HelpSection>
      </div>

      <button className="help-close" type="button" onClick={onClose}>
        {t("help.close")}
      </button>
    </section>
  );
}
