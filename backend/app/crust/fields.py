"""Field projections requested from Crustdata per stage (keeps payloads predictable)."""

# Minimal projection for peer discovery via /company/search
SEARCH_FIELDS = [
    "basic_info.name", "basic_info.primary_domain", "basic_info.description",
    "basic_info.year_founded", "basic_info.employee_count_range",
    "headcount.total", "funding.total_investment_usd", "taxonomy.categories",
    "locations.country",
]

# Full projection for the seven scenes via /company/enrich
# people.decision_makers alone was 5.1 MB of a 5.5 MB Five9 response, so only founders + CXOs are requested.
ENRICH_FIELDS = [
    "basic_info", "headcount", "hiring", "funding", "web_traffic", "news",
    "people.founders", "people.cxos",
    "competitors", "followers", "seo", "revenue", "taxonomy", "locations",
    "employee_reviews", "software_reviews",
]

# Light projection used when re-verifying candidates through /company/identify
IDENTIFY_FIELDS = None  # identify returns basic_info by default
