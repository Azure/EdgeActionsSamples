# EdgeAction: url-rewrite
This is an EdgeAction project of type: js

## Getting Started
1. Edit the edge_action.js file to implement your logic
2. Test your EdgeAction with: `edgeaction test`

## Files
- `edge_action.js`: Main EdgeAction implementation file
- `test_cases.json`: Test cases with input and expected output

## Testing
The `test_cases.json` file contains one or more test cases for your EdgeAction.
Each test case has:
- `test_name`: A descriptive name for the test
- `description`: (optional) What the test validates
- `input`: The EdgeActionEvent input to your function
- `expected`: The expected EdgeActionEvent output after processing

You can add multiple test cases to thoroughly test your EdgeAction:
```json
{
  "test_cases": [
    {
      "test_name": "my_test",
      "description": "Tests basic functionality",
      "input": {...},
      "expected": {...}
    }
  ]
}
```

Run tests with: `edgeaction test`

## Documentation
For more information about EdgeActions, see the documentation.
