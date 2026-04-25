1. Health Check
   1 Invoke-RestMethod -Uri http://localhost:4012/health

2. Account Verification
   1 Invoke-RestMethod -Method Post -Uri http://localhost:4012/send -ContentType "application/json" -Body '{"to": "test@example.com", "type":
   "account_verification", "context": {"name": "John Doe", "url": "https://example.com/verify"}}'

3. Password Reset
   1 Invoke-RestMethod -Method Post -Uri http://localhost:4012/send -ContentType "application/json" -Body '{"to": "test@example.com", "type": "password_reset",
   "context": {"url": "https://example.com/reset"}}'

4. General Notification
   1 Invoke-RestMethod -Method Post -Uri http://localhost:4012/send -ContentType "application/json" -Body '{"to": "test@example.com", "type":
   "general_notification", "context": {"subject": "Alert", "message": "Test"}}'

5. Invalid Type (Test Error Handling)
   1 try { Invoke-RestMethod -Method Post -Uri http://localhost:4012/send -ContentType "application/json" -Body '{"to": "test@example.com", "type":
   "invalid*type"}' } catch { $*.Exception.Response }
