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
    "expertinsights.com",       # Review / comparison site
    "itcentralstation.com",     # Now merged into PeerSpot
    "softwareworld.co",
    "getvoip.com",
    "techscore.io",
    # ── Analyst / market-research firms ─────────────────────────────────────
    "gartner.com",
    "forrester.com",
    "cbinsights.com",
    "pitchbook.com",
    "idc.com",
    "451research.com",
    "aberdeen.com",
    "everestgrp.com",
    "mckinsey.com",
    "bcg.com",
    "bain.com",
    "deloitte.com",
    "accenture.com",
    "pwc.com",
    "kpmg.com",
    "ey.com",
    "frost.com",               # Frost & Sullivan
    "omdia.com",               # Omdia analyst
    "radicalventures.com",
    "marketsandmarkets.com",
    "mordorintelligence.com",
    "grandviewresearch.com",
    "statista.com",
    "ibisworld.com",
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
    "klue.com",                # Competitive enablement tool
    "crayon.co",               # Competitive intelligence tool
    "kompyte.com",
    "battlecard.io",
    # ── Job boards / HR platforms ────────────────────────────────────────────
    "glassdoor",
    "indeed",
    "builtin",
    "ziprecruiter.com",
    "monster.com",
    "wellfound.com",
    "levels.fyi",
    "payscale.com",
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
    "substack.com",
    "dev.to",
    "hashnode.com",
    # ── Business directories / encyclopedias ─────────────────────────────────
    "crunchbase",
    "wikipedia",
    "wikiwand.com",
    "dnb.com",
    "manta.com",
    "bbb.org",
    "yelp.com",
    "bloomberg.com",
    "reuters.com",
    "ft.com",                  # Financial Times
    "wsj.com",                 # Wall Street Journal
    "forbes.com",
    "fortune.com",
    "inc.com",
    "entrepreneur.com",
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
    "securityweek.com",        # Security news site
    "csoonline.com",           # CSO / security news
    "helpnetsecurity.com",     # Security news
    "bleepingcomputer.com",    # Security news
    "infosecurity-magazine.com",
    "scmagazine.com",          # SC Magazine security news
    "securityboulevard.com",
    "therecord.media",         # Cybersecurity news
    "cyberscoop.com",          # Cybersecurity news
    "govinfosecurity.com",
    "bankinfosecurity.com",
    "databreachtoday.com",
    "ismg.io",                 # Information Security Media Group network
    # ── Press-release / wire services ────────────────────────────────────────
    "businesswire.com",
    "prnewswire.com",
    "globenewswire.com",
    "accesswire.com",
    "openpr.com",
    "einpresswire.com",
    "prweb.com",
    # ── AI-tools / SaaS-directory aggregators ────────────────────────────────
    "whattheai.tech",
    "champsignal.com",
    "theresanaiforthat.com",
    "futurepedia.io",
    "aitoptools.com",
    "topai.tools",
    "aitoolhunt.com",
    # ── Sales/compensation review sites ──────────────────────────────────────
    "repvue.com",               # Sales rep salary / employer review site
    "levels.fyi",               # Already present but reaffirmed here
    "payscale.com",
    "salary.com",
    "glassdoor.com",
    # ── Product/startup directories ───────────────────────────────────────────
    "productmint.com",          # Product comparison / startup directory
    "slant.co",
    "saashub.com",
    "getlatka.com",             # SaaS metrics directory
    "saasmag.com",
    "saaslist.com",
    # ── VC / investor / accelerator sites ────────────────────────────────────
    "a16z.com",
    "sequoiacap.com",
    "ycombinator.com",
    "techstars.com",
    "500.co",
    "firstround.com",
    "generalcatalyst.com",
    "accel.com",
    "greylock.com",
    "bessemervp.com",
    "nea.com",
    "indexventures.com",
    "lightspeedvp.com",
    "andreessenhorowitz.com",
)

# ---------------------------------------------------------------------------
# Company name fragment blacklist
# ---------------------------------------------------------------------------
# Checked against a normalised (lower-case, stripped) company name.
# Keep fragments specific enough to avoid false-positives on real company
# names (e.g. avoid single common words like "wired" or "clutch").
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Name suffix / type patterns that indicate a non-product company
# (VC firms, accelerators, law firms, etc.)
# Checked as substrings of the NORMALISED name (lower, no spaces/dots/dashes).
# ---------------------------------------------------------------------------
NON_COMPETITOR_TYPE_FRAGMENTS: tuple[str, ...] = (
    # VC / investor firm patterns (normalised: lowercase, no spaces/dots/dashes)
    "venturecapital",
    "vcfund",
    "vcfirm",
    "angelinvestor",
    "privateequity",
    "accelerator",
    "incubator",
    "valueaddvc",       # "Value Add VC" exactly
    # Design / creative agency patterns
    "newdealdesign",    # NewDealDesign — design agency
    "designagency",
    "creativestudio",
    "designstudio",
    # Generic short/meaningless names that slip through (exact normalized matches)
    # These are too vague to be real competitors
)

NON_COMPETITOR_NAME_FRAGMENTS: tuple[str, ...] = (
    # Review / comparison platforms
    "g2crowd",
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
    "expertinsights",
    "itcentralstation",
    "softwareworld",
    # Analyst / research firms
    "gartner",
    "forrester",
    "idc",                  # IDC analyst firm
    "cbinsights",
    "cbinsight",
    "pitchbook",
    "gartnergroup",
    "451research",
    "everestgrp",
    "mckinsey",
    "bcggroup",
    "bain&company",
    "deloitte",
    "accenture",
    "pwcgroup",             # PwC (avoid bare "pwc" which is too short)
    "kpmg",
    "frostandsullivan",
    "marketsandmarkets",
    "mordorintelligence",
    "grandviewresearch",
    "statista",
    "ibisworld",
    "omdia",
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
    "klue",
    "kompyte",
    # Business directories / encyclopedias
    "wikiwand",
    "crunchbase",
    "bloomberg",
    "reuters",
    "forbes",
    # AI-tools / SaaS-directory aggregators
    "whattheai",
    "champsignal",
    "futurepedia",
    # Tech news / media outlets
    "techcrunch",
    "venturebeat",
    "infoq",
    "zdnet",
    "techrepublic",
    "pcmag",
    "techradar",
    "darkreading",
    "securityweek",
    "csoonline",
    "helpnetsecurity",
    "bleepingcomputer",
    "infosecuritymagazine",
    "scmagazine",
    "securityboulevard",
    "cyberscoop",
    # Press release / wire services
    "businesswire",
    "prnewswire",
    "globenewswire",
    "openpr",
    "prweb",
    # Sales/compensation review sites
    "repvue",
    "payscale",
    "salary",
    # Product/startup directories
    "productmint",
    "saashub",
    "getlatka",
    "saasmag",
    "saaslist",
    "slant",
    # VC / investor firms
    "andreessenhorowitz",
    "sequoiacap",
    "generalcatalyst",
    "firstround",
    "lightspeedvp",
    "bessemervp",
    "indexventures",
)
