# Security Policy

## Supported versions

Only the latest release on the default branch receives security fixes. The project is pre-1.0 in spirit but versioned 1.1.x; upgrade to the newest tag before reporting.

## Reporting a vulnerability

Do not open a public issue for a security problem. Email the maintainers through the contact listed on the repository owner's GitHub profile, or use GitHub's private vulnerability reporting on this repository if it is enabled for your account. Include:

- the affected component (web build, native SDL2 build, headless build, save format, workflows)
- a reproduction or a concrete attack description
- the impact you believe it has on players or their saved worlds

You should get an acknowledgement within a week. Fixes land on a private branch when possible and ship in a release with the issue credited unless you prefer otherwise.

## Scope

Sandvoxel stores worlds locally in the browser and in binary save files next to the native executable. There are no accounts, no servers, and no telemetry, so most classic server-side classes do not apply. Interesting surfaces are the world import parser, the save file parser, and the single-file web build's interaction with portal iframes.
