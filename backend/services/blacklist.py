"""
Single source of truth for all domain and name-based blacklists.

Add entries here once — every pipeline stage imports from this module,
so nothing can slip through an outdated copy in another file.
"""

# ---------------------------------------------------------------------------
# Domain keyword blacklist
# ---------------------------------------------------------------------------
# Checked as substrings against the full domain string, so bare keywords
# like "linkedin" will match "www.linkedin.com", "linkedin.co.uk", etc.
# Use the full "example.com" form for more specific sites.
# ---------------------------------------------------------------------------
SKIP_DOMAIN_KEYWORDS: tuple[str, ...] = (
    # ── Software review / comparison platforms ──────────────────────────────
    "g2.com",
    "capterra",
    "getapp",
    "softwareadvice",
    "trustradius",
    "peerspot",
    "trustpilot",
    "comparably.com",
    "clutch.co",
    "sourceforge.net",
    "alternativeto.net",
    "producthunt.com",
    "slashdot.org",
    "crozdesk.com",
    "selecthub.com",
    "financesonline.com",
    "softwaresuggest.com",
    "spiceworks.com",
    "saasworthy.com",
    "technologyadvice.com",
    "featuredcustomers.com",
    # ── Analyst / market-research firms ─────────────────────────────────────
    "gartner.com",
    "forrester.com",
    "cbinsights.com",
    "pitchbook.com",
    "idc.com",
    "451research.com",
    "aberdeen.com",
    "everestgrp.com",
    # ── Competitive-intelligence / startup-intelligence tools ────────────────
    "zoominfo.com",
    "similarweb.com",
    "builtwith.com",
    "stackshare.io",
    "owler.com",
    "craft.co",
    "datanyze.com",
    "slintel.com",
    "tracxn.com",
    "growjo.com",
    "harmonic.ai",
    "dealroom.co",
    "mattermark.com",
    # ── Job boards / HR platforms ────────────────────────────────────────────
    "glassdoor",
    "indeed",
    "builtin",
    "ziprecruiter.com",
    "monster.com",
    "wellfound.com",
    # ── Social media / communities ───────────────────────────────────────────
    "linkedin",
    "facebook",
    "twitter",
    "x.com",
    "youtube",
    "pinterest",
    "reddit",
    "medium.com",
    "instagram",
    "tiktok.com",
    "quora.com",
    # ── Business directories / encyclopedias ─────────────────────────────────
    "crunchbase",
    "wikipedia",
    "wikiwand.com",       # Wikipedia reader / mirror (e.g. CB Insights page)
    "dnb.com",
    "manta.com",
    "bbb.org",
    "yelp.com",
    # ── Tech news / media outlets ────────────────────────────────────────────
    "techcrunch.com",
    "venturebeat.com",
    "zdnet.com",
    "techrepublic.com",
    "theverge.com",
    "wired.com",
    "businessinsider.com",
    "theregister.com",
    "computerworld.com",
    "infoworld.com",
    "pcmag.com",
    "techradar.com",
    "darkreading.com",
    # ── Press-release / wire services ────────────────────────────────────────
    "businesswire.com",
    "prnewswire.com",
    "globenewswire.com",
    "accesswire.com",
    "openpr.com",          # Press-release aggregator
    # ── AI-tools / SaaS-directory aggregators ────────────────────────────────
    "whattheai.tech",      # AI tools directory (hosts ChampSignal profiles)
    "champsignal.com",     # Sales intelligence / competitive signal tool
    "theresanaiforthat.com",
    "futurepedia.io",
    "aitoptools.com",
)

# ---------------------------------------------------------------------------
# Company name fragment blacklist
# ---------------------------------------------------------------------------
# Checked against a normalised (lower-case, stripped) company name.
# Keep fragments specific enough to avoid false-positives on real company
# names (e.g. avoid single common words like "wired" or "clutch").
# ---------------------------------------------------------------------------
NON_COMPETITOR_NAME_FRAGMENTS: tuple[str, ...] = (
    # Review / comparison platforms
    "g2",
    "capterra",
    "getapp",
    "softwareadvice",
    "trustradius",
    "peerspot",
    "trustpilot",
    "comparably",
    "sourceforge",
    "alternativeto",
    "producthunt",
    "crozdesk",
    "selecthub",
    "financesonline",
    "softwaresuggest",
    "spiceworks",
    "saasworthy",
    "technologyadvice",
    "featuredcustomers",
    # Analyst / research firms
    "gartner",
    "forrester",
    "idc",
    "cbinsights",
    "cbinsight",
    "pitchbook",
    "gartnergroup",
    "451research",
    "everestgrp",
    # Competitive-intelligence / startup-intelligence tools
    "zoominfo",
    "similarweb",
    "builtwith",
    "stackshare",
    "owler",
    "datanyze",
    "tracxn",
    "growjo",
    "dealroom",
    # Business directories / encyclopedias
    "wikiwand",
    # AI-tools / SaaS-directory aggregators
    "whattheai",
    "champsignal",
    "futurepedia",
    # Tech news / media
    "techcrunch",
    "venturebeat",
    "infoq",
    "zdnet",
    "techrepublic",
    "pcmag",
    "techradar",
    "darkreading",
    # Press release / wire services
    "businesswire",
    "prnewswire",
    "globenewswire",
    "openpr",
)
