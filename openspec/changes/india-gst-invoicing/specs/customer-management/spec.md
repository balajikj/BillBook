## ADDED Requirements

### Requirement: Customer record carries India-specific identification fields

The system SHALL store the following optional fields on each customer document under `/companies/{companyId}/customers/{customerId}`: `phoneNumber` (string), `shopName` (string), `fullAddress` (string), `gstNumber` (string). All four fields are optional; their absence on a customer record MUST NOT block creation, edit, or use of that customer on an invoice.

#### Scenario: Customer is created with all India-specific fields populated

- **WHEN** a company admin submits the create-customer form with `name: 'Globex Traders'`, `phoneNumber: '+91 9876543210'`, `shopName: 'Globex Mart'`, `fullAddress: '12 MG Road, Bengaluru 560001'`, `gstNumber: '29ABCDE1234F1Z5'`
- **THEN** the resulting Firestore document includes all five fields verbatim
- **AND** `createdAt` and `createdBy: <uid>` are set

#### Scenario: Customer is created with only the legacy required fields

- **WHEN** a company admin submits the create-customer form with only `name: 'Walk-in Customer'`
- **THEN** the document is written with `name` only; `phoneNumber`, `shopName`, `fullAddress`, `gstNumber` are absent
- **AND** the customer is selectable on the invoice form
- **AND** the resulting invoice header simply omits the missing fields

### Requirement: GSTIN format is validated when provided

The system SHALL validate the `gstNumber` field against the 15-character GSTIN pattern `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$` whenever the field is non-empty. The system MUST NOT verify the GSTIN checksum digit. Empty / absent `gstNumber` MUST be accepted (the field is optional).

#### Scenario: Valid GSTIN is accepted

- **WHEN** a company admin enters `29ABCDE1234F1Z5` in the GST number field
- **THEN** the form accepts the value as valid

#### Scenario: Malformed GSTIN is rejected

- **WHEN** a company admin enters `29ABCDE1234F1Z` (only 14 characters)
- **THEN** the form blocks submission with a "Enter a valid 15-character GSTIN" message

#### Scenario: Empty GSTIN is accepted

- **WHEN** a company admin leaves the GST number field empty
- **THEN** the form allows submission and the field is stored absent / empty on the customer document

### Requirement: Phone number format is permissive

The system SHALL accept phone numbers matching `^(\+?\d{1,3}[\s-]?)?\d{10}$`, supporting bare 10-digit Indian mobile numbers and `+91`-prefixed forms (with optional space or hyphen separator).

#### Scenario: Bare 10-digit number is accepted

- **WHEN** a company admin enters `9876543210` as the phone number
- **THEN** the form accepts it as valid

#### Scenario: `+91` prefixed number is accepted

- **WHEN** a company admin enters `+91 9876543210`
- **THEN** the form accepts it as valid

#### Scenario: Non-numeric or wrong-length number is rejected

- **WHEN** a company admin enters `98765` (5 digits)
- **THEN** the form blocks submission with a phone-validation message

### Requirement: Customer snapshot embedded in invoices carries India-specific fields

The system SHALL extend the customer snapshot embedded in every new invoice to include `shopName`, `fullAddress`, `gstNumber`, and `phoneNumber`, taken from the picked customer at invoice-creation time. Missing fields on the source customer MUST snapshot as empty / absent. Existing invoices created before this change SHALL NOT be retroactively modified.

#### Scenario: New invoice snapshots all available India-specific fields

- **WHEN** a user creates an invoice using a customer with `shopName: 'Acme Mart'`, `fullAddress: '5 Anna Salai'`, `gstNumber: '33ABCDE1234F1Z5'`, `phoneNumber: '+91 9000000000'`
- **THEN** the resulting invoice's customer snapshot contains `shopName: 'Acme Mart'`, `fullAddress: '5 Anna Salai'`, `gstNumber: '33ABCDE1234F1Z5'`, `phoneNumber: '+91 9000000000'`

#### Scenario: Snapshot survives later customer edits

- **WHEN** a customer's `gstNumber` is later edited from `33ABCDE1234F1Z5` to `33ABCDE1234F2Z4`
- **THEN** invoices already created continue to display the original `33ABCDE1234F1Z5` from their snapshot

#### Scenario: Snapshot tolerates customers without GSTIN

- **WHEN** a user creates an invoice using a customer whose `gstNumber` is unset
- **THEN** the invoice's customer snapshot has `gstNumber` absent / empty
- **AND** the invoice's printed header omits the GSTIN line entirely
