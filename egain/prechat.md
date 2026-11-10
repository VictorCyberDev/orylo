# Pre-chat workflow

Status: **Prepared in repo.** Configured in eGain: `BLOCKED — no eGain tenant access in this environment`. Tested in eGain: `BLOCKED — no eGain tenant access in this environment`.

The hackathon requires a pre-chat workflow that collects useful information before the visitor reaches the AI Agent (https://www.egain.com/ai-agent-hackathon/). eGain's public release notes describe pre-chat workflows sharing session variables with process and escalation workflows "by exact name" (excerpt from https://ebrain.egain.com/kb/updates/content/EASY-19122/Enhancements-21236; the page renders client-side, so only the search excerpt was read). How to build the form in the trial UI is `UNVERIFIED — confirm in the trial UI`.

## Fields

Variable names must be identical in the pre-chat form, the process workflow and the escalation workflow, because eGain reuses session variables by exact name (see the release-note excerpt above; `Documented publicly` as an excerpt only, behaviour in the trial `UNVERIFIED in trial`).

| Variable | Label shown | Type | Required | Validation | Sent to Orylo as |
|---|---|---|---|---|---|
| `fullName` | Full name | text | yes | 2–80 characters, letters, spaces, hyphens, apostrophes | `fullName` |
| `email` | Email address on the account | email | yes | valid email syntax, max 254 characters | `email` |
| `accountNumber` | Account number | text | yes | pattern `^NF-[0-9]{6}$` (synthetic format) | `accountNumber` |
| `issueCategory` | What is this about? | single choice | yes | one of: `Cancellation was not applied`, `Unexpected or repeated charge`, `Billing question`, `Something else` | included in `issue` |
| `issueSummary` | Briefly describe the issue (optional) | multi-line text | no | max 800 characters | included in `issue` |
| `demoDataConsent` | I understand this is a demonstration. I will only use fictional details. | checkbox | yes | must be ticked to continue | not sent |

`issueSummary` is an addition to the requested field list. The Action API requires an `issue` string of at most 1000 characters on `POST /api/v1/egain/sessions`, and a category alone gives the agent little to work with. If the trial form cannot hold a multi-line field, drop `issueSummary` and send the category label only.

`issue` is built as: `<issueCategory>: <issueSummary>` truncated to 1000 characters. If `issueSummary` is empty, send only the category label.

## Helper text to show on the form

> This is a demonstration of a fictional subscription provider, Northfield Digital. Please use only made-up details. Do not enter real names, email addresses, account numbers, passwords or payment details.
>
> To try the demonstration, you can use: Jordan Reyes, jordan.reyes@customer.example, account NF-100234.

The sample identity is optional. It makes the demonstration repeatable for reviewers. Because each successful action changes the synthetic account, the Orylo side needs a way to reset the synthetic identities before recording and before reviewers visit; this is an open dependency for the Orylo engineer, see `../docs/hackathon/submission-checklist.md`.

## How values reach the agent and the Action

1. The visitor submits the form. The values are stored as eGain session variables with the names above. (Mechanism `UNVERIFIED — confirm in the trial UI`.)
2. The AI Agent greets the visitor by `fullName` and acknowledges the category without repeating the account number.
3. When intent I-02 is recognised, the process workflow reads `fullName`, `email`, `accountNumber` and the built `issue` from session variables and sends them to `POST /api/v1/egain/sessions` (see `action-contracts/openapi.yaml`). The visitor is not asked to retype them, unless verification fails (see `workflows/failed-cancellation-guided-flow.md`, Branch A).
4. The escalation workflow reads the same variables, plus `caseReference` if one exists, so that the handoff carries context. See `escalation.md`.
5. If the Action is not available in the trial, the variables are still used to personalise the conversation and to pre-fill the escalation message, and nothing is sent to Orylo.

Values returned by Orylo (`caseReference`, `customerToken`, `caseState`, and so on) are held in additional workflow variables. `customerToken` is a bearer credential that expires after 30 minutes. It must never be shown in chat, never written into the transcript, and never included in an escalation message. Whether the trial lets a variable be kept out of the transcript is `UNVERIFIED — confirm in the trial UI`; if it cannot, the token must not be stored in a variable that the transcript displays.

## What is not collected

- Passwords, PINs or security codes.
- Payment card numbers, bank details or any payment data.
- Government identifiers, dates of birth, home addresses.
- Real phone numbers. A callback request uses the demonstration number only and records a preferred time window (see `escalation.md`).
- Any real personal data. The consent checkbox exists to make this explicit.

If a visitor types any of the above into the free-text field or into chat, the agent applies intent U-06 (`intents.md`): it asks them not to share it, does not repeat it back, and does not pass it to any action.

## Behaviour on invalid input

- Empty required field: the form shows an inline message ("This field is needed to continue.") and does not start the chat.
- Invalid email or account number format: "That doesn't look like the right format. Please check it, or use the sample details shown below the form."
- Consent box not ticked: "Please tick the box to confirm you will use only fictional details."
- A syntactically valid but unverifiable email or account number is **not** blocked by the form. It is handled by the verification step so that the agent never reveals whether an account exists.
