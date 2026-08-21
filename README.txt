BIG BUCKS FANTASY LEAGUE — V1

FILES
- index.html = page structure
- styles.css = colors and design
- data.js = EDIT THIS for team names, owners, current week, and weekly scores
- app.js = schedule/standings logic
- assets/logo.png = league logo

HOW TO UPDATE TEAM NAMES
Open data.js and replace "Team 1", "Owner 1", etc.

HOW TO ENTER SCORES
In data.js, edit the scores section. Example:

scores: {
  1: {
    "1-16": [164.22, 151.08],
    "2-15": [142.30, 147.10]
  }
}

The key always uses the lower team ID first. The website automatically updates standings.

HOW TO VIEW LOCALLY
Double click index.html.

FREE HOSTING OPTION
Create a GitHub account/repository, upload these files, then enable GitHub Pages from the repository Settings > Pages area.
