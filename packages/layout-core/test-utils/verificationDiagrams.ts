export const VERIFICATION_DIAGRAMS: Record<string, string> = {
  screenshot: `
event start message "Order placed" as n1
task "Review order" as n2
boundary timer nonInterrupting "SLA breach" as b1 on n2
gateway exclusive "Approved?" as g1
task "Ship order" as n3
event end none "Done" as n4
event end terminate "Rejected" as n5
dataObject "Invoice" as d1

n1 -> n2
n2 -> g1
g1 => n3 : "yes"
g1 ->> n5
n3 -> n4
d1 ..> n2
b1 -> n5
`.trim(),

  poolLaneTwoBoundary: `
pool "Order Process"
  lane "Sales"
    event start none "Start" as n1
    task "Review order" as n2
    boundary timer interrupting "Timeout" as b1 on n2
    boundary error nonInterrupting "Error" as b2 on n2
    task "Escalate" as n3
    task "Notify" as n4
  lane "Warehouse"
    task "Pack order" as n5
    event end none "Shipped" as n6

n1 -> n2
n2 -> n5
n5 -> n6
b1 -> n3
b2 -> n4
`.trim(),

  fanOut: `
event start none "Start" as n1
gateway parallel "Split" as g1
task "Path A" as a1
task "Path B" as a2
task "Path C" as a3
gateway parallel "Join" as g2
event end none "End" as n2
dataObject "Shared doc" as d1
dataStore "Archive" as ds1

n1 -> g1
g1 -> a1
g1 -> a2
g1 -> a3
a1 -> g2
a2 -> g2
a3 -> g2
g2 -> n2
a2 ..> d1
n2 ~> ds1
`.trim(),

  nestedSubprocess: `
event start none "Start" as n1
subprocess "Handle payment" as sp1
  event start none "Sub start" as sn1
  task "Charge card" as sn2
  boundary timer nonInterrupting "Slow charge" as sb1 on sn2
  task "Retry" as sn3
  event end none "Sub end" as sn4
  sn1 -> sn2
  sn2 -> sn4
  sb1 -> sn3
task "Send receipt" as n2
event end none "Done" as n3

n1 -> sp1
sp1 -> n2
n2 -> n3
`.trim(),

  crowdedBoundary: `
task "Do work" as t1
boundary timer interrupting "T1" as b1 on t1
boundary error nonInterrupting "T2" as b2 on t1
boundary escalation nonInterrupting "T3" as b3 on t1
event end none "Timeout path" as e1
event end none "Error path" as e2
event end none "Escalation path" as e3
gateway exclusive "Gate" as g1
task "Next" as t2

t1 -> g1
g1 -> t2
b1 -> e1
b2 -> e2
b3 -> e3
`.trim(),

  orderToCashStacked: `
pool "Order-to-Cash"
  lane "Customer"
    event start message "Order submitted" as c1
    task "Confirm receipt" as c2
    event intermediate message "Status update" as c3
    event end none "Order closed" as c4
  lane "Sales"
    task "Validate order" as s1
    gateway exclusive "Credit OK?" as s2
    task "Request deposit" as s3
    task "Create sales order" as s4
    event end terminate "Rejected" as s5
  lane "Finance"
    task "Check credit" as f1
    task "Capture payment" as f2
    boundary timer interrupting "Payment timeout" as fb1 on f2
    task "Issue refund" as f3
    dataObject "Invoice" as fd1
  lane "Warehouse"
    gateway parallel "Split fulfillment" as w1
    task "Pick items" as w2
    task "Pack shipment" as w3
    gateway parallel "Join fulfillment" as w4
    task "Ship order" as w5
    callActivity "Carrier booking" as w6
    event end none "Shipped" as w7
  c1 -> c2
  c2 -> s1
  s1 -> f1
  f1 -> s2
  s2 => s4 : "yes"
  s2 ->> s3
  s3 -> f2
  f2 -> s4
  fb1 -> f3
  f3 -> s5
  s4 -> w1
  w1 -> w2
  w1 -> w3
  w2 -> w4
  w3 -> w4
  w4 -> w5
  w5 -> w6
  w6 -> w7
  w7 -> c3
  c3 -> c4
  fd1 ..> f2

pool "External Carrier"
  lane "Logistics Partner"
    event start message "Booking request" as e1
    task "Allocate truck" as e2
    event end message "Tracking sent" as e3
  e1 -> e2
  e2 -> e3

w6 -> e1
e3 -> c3
`.trim(),

  // STATUS gap A: boundary initial exit shares the host's x-column with a node below.
  // Shared router must clear that column (pre-migration clipped the exit stub).
  boundaryExitColumnClip: `
task "Host" as h1
task "Below" as below
boundary timer interrupting "T" as b1 on h1
event end none "Target" as t1
event start none "S" as s1

s1 -> h1
h1 -> below
below -> t1
b1 -> t1
`.trim(),

  // STATUS gap B + deferred coverage: two boundary edges from different hosts that
  // would share an avoidance corridor without sequential obstacle accumulation.
  boundarySharedAvoidance: `
pool "P"
  lane "A"
    event start none "Start" as s1
    task "Host1" as h1
    boundary timer interrupting "T1" as b1 on h1
    task "Host2" as h2
    boundary error interrupting "E1" as b2 on h2
    task "Obstacle" as o1
    task "Target1" as t1
    task "Target2" as t2
  lane "B"
    task "Pad" as p1

s1 -> h1
h1 -> h2
h2 -> o1
b1 -> t1
b2 -> t2
`.trim(),

  // STATUS gap C: same Order-to-Cash topology forced onto layout: flat (no swimlane banding).
  orderToCashStackedFlat: `
layout: flat
pool "Order-to-Cash"
  lane "Customer"
    event start message "Order submitted" as c1
    task "Confirm receipt" as c2
    event intermediate message "Status update" as c3
    event end none "Order closed" as c4
  lane "Sales"
    task "Validate order" as s1
    gateway exclusive "Credit OK?" as s2
    task "Request deposit" as s3
    task "Create sales order" as s4
    event end terminate "Rejected" as s5
  lane "Finance"
    task "Check credit" as f1
    task "Capture payment" as f2
    boundary timer interrupting "Payment timeout" as fb1 on f2
    task "Issue refund" as f3
    dataObject "Invoice" as fd1
  lane "Warehouse"
    gateway parallel "Split fulfillment" as w1
    task "Pick items" as w2
    task "Pack shipment" as w3
    gateway parallel "Join fulfillment" as w4
    task "Ship order" as w5
    callActivity "Carrier booking" as w6
    event end none "Shipped" as w7
  c1 -> c2
  c2 -> s1
  s1 -> f1
  f1 -> s2
  s2 => s4 : "yes"
  s2 ->> s3
  s3 -> f2
  f2 -> s4
  fb1 -> f3
  f3 -> s5
  s4 -> w1
  w1 -> w2
  w1 -> w3
  w2 -> w4
  w3 -> w4
  w4 -> w5
  w5 -> w6
  w6 -> w7
  w7 -> c3
  c3 -> c4
  fd1 ..> f2
`.trim(),
};
