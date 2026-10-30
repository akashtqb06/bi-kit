export interface SampleFixture {
  id: string;
  name: string;
  bankName: string;
  accountKind: 'bank' | 'credit_card';
  description: string;
  filename: string;
  content: string;
}

export const SAMPLE_FIXTURES: SampleFixture[] = [
  {
    id: 'hdfc',
    name: 'HDFC Bank Savings Statement',
    bankName: 'HDFC Bank',
    accountKind: 'bank',
    description: 'Separate Withdrawal/Deposit columns, DD/MM/YYYY dates, Indian numbering system commas ("1,25,000.00")',
    filename: 'hdfc_statement.csv',
    content: `Date,Narration,Chq/Ref No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/10/2026,SALARY CREDIT OCT 2026 / TECHCORP,REF9823472394,01/10/2026,,"1,25,000.00","1,85,420.50"
02/10/2026,UPI/428938129381/HOUSE RENT/HDFC/owner@okhdfc,UPI-428938129381,02/10/2026,"32,000.00",,"1,53,420.50"
05/10/2026,RD INSTALLMENT TRANSFER 5000,INT-RD-1024,05/10/2026,"5,000.00",,"1,48,420.50"
08/10/2026,ATM WDL / CHENNAI T NAGAR BRANCH,ATM-84920,08/10/2026,"8,000.00",,"1,40,420.50"
12/10/2026,UPI/429384928342/SWIGGY/HDFC/swiggy@icici,UPI-429384928342,12/10/2026,"845.00",,"1,39,575.50"
18/10/2026,REFUND / AMAZON PAY INDIA / RTN48201,REF-AMZ-9382,18/10/2026,,"2,499.00","1,42,074.50"
25/10/2026,CREDIT CARD BILL PAYMENT FULL,CC-BILL-8492,25/10/2026,"14,580.00",,"1,27,494.50"`,
  },
  {
    id: 'axis-bom',
    name: 'Axis Bank Statement (UTF-8 BOM)',
    bankName: 'Axis Bank',
    accountKind: 'bank',
    description: 'Contains UTF-8 Byte Order Mark (\\uFEFF), Type column (CR/DR), DD/MM/YYYY dates',
    filename: 'axis_utf8_bom_statement.csv',
    content: `\uFEFFDate,Transaction Details,Type,Amount,Balance
01/10/2026,Client Project Advance Payout,CR,250000.00,312000.00
03/10/2026,Office Coworking Space WeWork,DR,18500.00,293500.00
07/10/2026,Google Cloud Platform Hosting,DR,4820.00,288680.00
12/10/2026,Apple Store Online MacBook Accessories,DR,12400.00,276280.00
20/10/2026,Domestic Flight Ticket Indigo,DR,9850.00,266430.00`,
  },
  {
    id: 'credit-card',
    name: 'Credit Card Statement',
    bankName: 'Credit Card (Any Issuer)',
    accountKind: 'credit_card',
    description: 'Credit Card charges as positive, payments as negative (-8839.00), DD-MM-YYYY dates',
    filename: 'credit_card_statement.csv',
    content: `Transaction Date,Posting Date,Transaction Details,Amount (INR)
11-10-2026,12-10-2026,AMAZON SELLER SERVICES MUMBAI,4500.00
14-10-2026,15-10-2026,ZOMATO FOOD DELIVERY GURGAON,640.00
18-10-2026,19-10-2026,SHELL FUEL STATION OMR CHENNAI,3200.00
20-10-2026,20-10-2026,NETFLIX RECURRING SUBSCRIPTION,499.00
25-10-2026,26-10-2026,AUTOPAY PAYMENT RECEIVED - THANK YOU,-8839.00
28-10-2026,29-10-2026,STARBUCKS COFFEE KORAMANGALA,750.00`,
  },
  {
    id: 'sbi-noisy',
    name: 'SBI Statement (Noisy, Duplicates, Malformed)',
    bankName: 'State Bank of India',
    accountKind: 'bank',
    description: 'Complex narrations, intra-file duplicate rows (Chai Point), and malformed corrupted record',
    filename: 'sbi_noisy_statement.csv',
    content: `Txn Date,Txn Description,Debit,Credit,Balance
01-10-2026,TRANSFER FROM 98765432109 / INB / UPI / NEFT SALARY / REF#983472394,,160000.00,285000.00
02-10-2026,POS 4123********1234 CHAI POINT BANGALORE IN REF#892348239482,250.00,,284750.00
02-10-2026,POS 4123********1234 CHAI POINT BANGALORE IN REF#892348239482,250.00,,284750.00
05-10-2026,INVALID_MALFORMED_LINE_CORRUPTED_RECORD,,N/A,
10-10-2026,EMI DEBIT / LOAN A/C 982348293849 / HDFC HOME FINANCE,42000.00,,242750.00
15-10-2026,NACH DEBIT / NATIONAL PUBLIC SCHOOL TUITION / Q3,45000.00,,197750.00
18-10-2026,POS BILLA SUPERMARKET CHENNAI IN / AUTH 492019,28000.00,,169750.00`,
  },
  {
    id: 'icici',
    name: 'ICICI Bank Statement',
    bankName: 'ICICI Bank',
    accountKind: 'bank',
    description: 'ISO YYYY-MM-DD dates, single signed amount (negative for withdrawals, positive for deposits)',
    filename: 'icici_statement.csv',
    content: `Transaction Date,Description,Amount,Balance
2026-10-01,Tech Consulting Retainer Wire,180000.00,324500.00
2026-10-03,ATM Cash Withdrawal Chennai,-25000.00,299500.00
2026-10-07,Local Provisions Kirana Store,-6500.00,293000.00
2026-10-10,Flipkart Electronics Purchase,-35000.00,258000.00
2026-10-14,Overseas Client Payout Direct Wire,410000.00,668000.00
2026-10-24,Credit Card Partial Bill Pay,-21000.00,647000.00`,
  },
];
