# Release data from open databases and Release Reports, watched without knowing the reader

Status: accepted

New and Upcoming Volumes come from polling open book databases for the next Volume of each watched Edition Line, plus Release Reports from readers. We do not scrape commercial release calendars: their coverage is better, but scraping is fragile and likely against their terms. Paid trade feeds are excluded because they don't fit an open-source, self-hostable project. As a result, New Volumes are reliable but Upcoming Volumes are partial. The release watcher stores only watched Edition Lines and an anonymous push subscription for each, never the reader's identity or Library. Matching against the reader's Private data happens on their device.
