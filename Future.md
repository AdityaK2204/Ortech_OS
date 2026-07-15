ORTECH OS — Digital Measurement Book (DMB)
Core Philosophy

The supervisor should never enter the same information twice.

Today the workflow is:

Work Done
      ↓
Notebook
      ↓
WhatsApp
      ↓
Excel Measurement Sheet
      ↓
Billing Engineer
      ↓
Invoice

ORTECH OS changes it to

Work Done
      ↓
Digital Measurement Book (DMB)
      ↓
Everything else is generated automatically

• Project Progress
• Chainage Map
• Dashboard
• Daily Progress Report
• Measurement Sheet
• Billing Data
• Photo Evidence

The DMB becomes the single source of truth for the company.

Mobile-first Design

This page is designed for supervisors standing on site under sunlight using a mobile phone.

No spreadsheets.

No tiny fields.

One work segment = One Measurement Card.

Screen Structure
--------------------------------------------------

Daily Measurements

Project
Date

Today's Target
Today's Completed

--------------------------------------------------

+ New Measurement

--------------------------------------------------

Measurement #1

--------------------------------------------------

Location

Chainage

Depth

Work Details

Payable Items

Photos

Remarks

--------------------------------------------------

Measurement #2

...

--------------------------------------------------

Measurement #3

...

--------------------------------------------------

Today's Summary

Verified Length

No. of Measurements

Today's Photos

Estimated Payable Length

--------------------------------------------------

Submit Day


The supervisor keeps adding measurement cards throughout the day.

At the end,

he submits the entire day's work.

Measurement Card Structure

Each measurement card records one continuous stretch of work.

Section 1 — Location
📍 Landmark / Location

[ Near Electric Pole ]

(Optional)

Current GPS

Captured automatically


Eventually GPS becomes evidence.

Not mandatory for V1.

Section 2 — Chainage
FROM

[230]

TO

[347]

Depth

[165] cm


The moment the supervisor enters

230

347

the system instantly calculates

Actual Length

117 m

No typing.

No calculator.

Section 3 — Strata

Instead of dropdowns.

Large touch buttons.

○ Non Rocky

○ Dry Rocky

○ Hard Rock

● HDD

One tap.

Section 4 — Other Payable Items

NOT a dropdown.

Use multi-select.

☑ PLB

☐ Blowing

☐ C.C.

☐ DWC

☐ GI

☐ Chamber

☐ Route Marker

☐ FDMS/DF

☐ Gravel

☐ WBM

☐ Asphalt

☐ Others

Because multiple payable items can exist on one stretch.

Section 5 — Photos
📷 Add Photos


Each photo belongs to

Measurement

↓

Chainage

↓

Location

↓

Date

Later,

clicking

230–347m

on the map

shows these photos.

Section 6 — Remarks
Remarks

______________________


Examples

HDD / HARD ROCK

Road Crossing

Near School

Culvert

Auto Calculations

Supervisor enters

From

230

To

347

System calculates

Actual Length

117m

Automatically.

If strata is

HDD

then

HDD

117m

is automatically entered.

If

Non Rocky

then

Non Rocky

117m

is filled.

No manual calculations.

Multiple Measurements

Example

Measurement 1

0 → 230

Measurement 2

230 → 347

Measurement 3

347 → 476

Measurement 4

476 → 703


All belong to

15 July

Project XYZ

Supervisor ABC
End of Day Summary

Before submitting

show

Today's Summary

Measurements

6

Verified Length

742m

Photos

18

Estimated Payable Length

725m


Supervisor knows

what he's submitting.

Database Structure

Each measurement is stored independently.

Measurement

id

project_id

supervisor_id

date

landmark

chainage_from

chainage_to

depth_cm

actual_length

payable_length

strata

payable_items[]

remarks

photos[]

gps

verification_status

created_at

Daily Pulse simply references

many measurements.

Progress Calculation

Supervisor NEVER enters

Progress

35%

The system calculates

progress from measurements.

Dashboard

Dashboard updates

automatically.

Chainage Map

Chainage Map updates

automatically.

Geographic Map

Map updates

automatically.

Billing

Billing updates

automatically.

Everything originates from

Measurements.

Export Measurement Sheet

This is the biggest feature.

The supervisor never sees Excel.

The billing engineer downloads it.

Export Options
Download

▼

Excel (.xlsx)

PDF

CSV

Export by Billing Period

Instead of

Today's Measurements

Export

Project

Date Range

From

1 July

To

15 July


ORTECH OS collects

every measurement

during that period.

Download Format

The generated Excel must be IDENTICAL to the existing Joint Measurement Sheet.

Not similar.

Exactly the same.

Header
JOINT MEASUREMENT SHEET

OF

PROJECT NAME

WITH EXTRA PAYABLE ITEMS

Yellow background.

Merged cells.

Same fonts.

Same borders.

Columns

Exactly preserve

S No

Landmark / Location

Chainage

From

To

Depth

Actual Length

Payable Length

Strata

Non Rocky

Dry Rocky

Hard Rock

HDD

Other Payable Items

PLB

Blowing

C.C.

DWC

GI

Chamber

RM

FDMS/DF

Others

Restoration

Gravel

WBM

Asphalt

Remarks

Same widths.

Same alignment.

Same merged headers.

How Data Maps

Supervisor enters

Landmark

Near Electric Pole

Chainage

230 → 347

Depth

165

Strata

HDD

PLB

YES

Remarks

HDD / HARD ROCK

Automatically becomes

S No	Landmark	From	To	Depth	Actual	Payable	HDD	PLB	Remarks
4	HDD, Near Electric Pole	230	347	165	117	117	117	117	HDD/HARD ROCK

No editing.

Ready for billing.

Future "Generate Bill"

Eventually

Billing

↓

Select Project

↓

Select Billing Period

↓

Generate

Produces

Measurement Sheet

+

Photo Annexure

+

Payable Summary

+

Supporting Evidence


Instead of spending days making bills,

the billing engineer spends minutes reviewing them.

Future Measurement Verification

Each measurement eventually has

Supervisor

✓

Site Engineer

✓

QC

✓

Accounts

✓

The measurement becomes progressively trusted.

The Real Vision

Today, the company treats measurements as paperwork.

In ORTECH OS, measurements become the foundation of the entire business.

One measurement entry should automatically power:

Daily progress
Chainage Map
Geographic Map
Project completion %
Supervisor performance
Incentive calculation
Daily Progress Report (DPR)
Client Measurement Sheet
Billing
Photo evidence
Historical records
Analytics and future bidding intelligence

That means the supervisor records the work once, and every department—from Operations to Billing to Management—works from the same verified data.

One enhancement I'd strongly recommend

I'd add one more field to every Measurement Card:

Measurement Type

○ Normal Trenching

○ HDD Crossing

○ Culvert

○ Road Crossing

○ Bridge Crossing

○ Chamber Work

○ Restoration

○ Other