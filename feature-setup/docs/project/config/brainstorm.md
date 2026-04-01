Enable Banking — Transaction Matching Design                                   
                                                                                 
  Connection                                                                     
  Users connect their bank via Enable Banking OAuth. The app fetches their       
  accounts and syncs transactions on demand (or via webhook). Bank transactions  
  are stored in the existing Transaction table with source: "bank" to distinguish
   them from other entries. refer to enablebanking.md file (first point of reference)                                                     
                                                            
  Two transaction types                                                          
  - source: "bank" — pulled from Enable Banking, ground truth for
  amount/date/merchant                                                           
  - source: "invoice" — created from the invoice generator or file upload flow
                                                                                 
  Matching                                                                       
  When a user matches a bank transaction to an invoice/file, the bank transaction
   record absorbs the invoice data (category, project, description, notes,       
  files). The result is one unified record with full context from both sides. The
   invoice transaction is flagged as matched and hidden from the main list — data
   preserved, not deleted.                                  

  Unmatched state                                                                
  Unmatched bank transactions are visible and usable as standalone records.
  Unmatched invoices stay in their current flow. Matching is always              
  user-initiated.                              