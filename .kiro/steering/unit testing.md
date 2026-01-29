---
inclusion: always
---
<!------------------------------------------------------------------------------------
   Add rules to this file or a short description and have Kiro refine them for you.
   
   Learn about inclusion modes: https://kiro.dev/docs/steering/#inclusion-modes
-------------------------------------------------------------------------------------> 

When writing unit tests, always ensure that mocks are used appropriately to avoid real API calls, and that they are properly set up. The tests and mocked responses must be structured so that tests aren't deadlocked or hang. 