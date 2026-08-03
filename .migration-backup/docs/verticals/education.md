# Education

## Who this is for

Schools, tutoring centers, music academies, dance studios, driving schools, vocational training centers, and any institution that charges fees to enrolled students.

## Activated modules

| Module | What it does |
|---|---|
| Fee Collection | Charge and collect tuition and incidental fees |
| Student Accounts | Student profiles, enrollment status, fee history |
| Enrollment | Enroll/withdraw students from programs or classes |
| Attendance | Record and report daily attendance |

## Students

Location: `/education`

Each student profile holds:
- Name, DOB, contact info
- Parent/guardian contact
- Enrollment status: Active, Inactive, Graduated, Withdrawn
- Outstanding balance (sum of unpaid fees)
- Fee history

### Outstanding balance alert

If a student has outstanding fees, their profile shows a red alert banner with the total amount due. This is visible at the front desk before a class or service is provided.

## Fee management

### Fee types

| Type | Example |
|---|---|
| Tuition | Monthly enrollment fee |
| Registration | One-time setup fee |
| Material | Lab fee, music book, uniform |
| Exam | Testing or certification fee |
| Late fee | Applied automatically for overdue tuition |

### Creating a fee

1. Open a student's profile → **Fees** tab
2. Click **New fee**
3. Enter: fee type, amount, due date, description
4. Manager role required

### Collecting a fee

1. Open the fee record → **Collect**
2. Enter the payment method (cash, card, bank transfer)
3. The fee status changes to **Paid**; outstanding balance decreases
4. If the fee was already paid, the system returns a `already_paid` error (409)

### Overdue fees

Fees past their due date are highlighted in amber on the student's fee list and in reports. The system does not automatically apply late fees — a manager must add a late fee record manually.

## Dashboard widget

The Education widget on the dashboard shows:
- Recent active students
- Their outstanding balance (red if > $0)
- Link to the full student list

## Enrollment

**Education → Enrollment**

- Enroll a student in a program/class by selecting from the program list
- Set enrollment start and end dates
- Tuition fees can be linked to enrollment (auto-created on enrollment)

## Reporting

| Report | What to track |
|---|---|
| Fee collection by period | Revenue from tuition and fees |
| Outstanding AR | Students with unpaid balances |
| Enrollment by program | Headcount per class |
| Attendance summary | Attendance rate per student or class |
