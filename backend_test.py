import requests
import sys
import json
import time
from datetime import datetime
from pathlib import Path

class SmartResearchAPITester:
    def __init__(self, base_url="https://citewise.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.user_id = None
        self.uploaded_file_id = None
        self.question_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, form_data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, data=form_data)
                elif form_data:
                    response = requests.post(url, data=form_data)
                else:
                    headers['Content-Type'] = 'application/json'
                    response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                headers['Content-Type'] = 'application/json'
                response = requests.put(url, json=data, headers=headers)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test the root API endpoint"""
        success, response = self.run_test(
            "Root API Endpoint",
            "GET",
            "",
            200
        )
        return success

    def test_create_user(self):
        """Test user creation"""
        user_data = {
            "name": f"Test User {datetime.now().strftime('%H%M%S')}",
            "email": f"test_{datetime.now().strftime('%H%M%S')}@example.com"
        }
        
        success, response = self.run_test(
            "Create User",
            "POST",
            "users",
            200,
            data=user_data
        )
        
        if success and 'id' in response:
            self.user_id = response['id']
            print(f"   Created user with ID: {self.user_id}")
            return True
        return False

    def test_get_user(self):
        """Test getting user by ID"""
        if not self.user_id:
            print("❌ No user ID available for testing")
            return False
            
        success, response = self.run_test(
            "Get User",
            "GET",
            f"users/{self.user_id}",
            200
        )
        
        if success:
            print(f"   User credits: {response.get('credits', 'N/A')}")
        return success

    def test_file_upload(self):
        """Test file upload functionality"""
        # Create a test file
        test_content = "This is a test research document for the Smart Research Assistant.\n\nIt contains sample content for testing file upload functionality."
        
        files = {
            'file': ('test_research.txt', test_content, 'text/plain')
        }
        
        success, response = self.run_test(
            "File Upload",
            "POST",
            "upload",
            200,
            files=files
        )
        
        if success and 'file_id' in response:
            self.uploaded_file_id = response['file_id']
            print(f"   Uploaded file with ID: {self.uploaded_file_id}")
            return True
        return False

    def test_research_question_submission(self):
        """Test submitting a research question"""
        if not self.user_id:
            print("❌ No user ID available for testing")
            return False
            
        form_data = {
            'user_id': self.user_id,
            'question': 'What are the latest trends in artificial intelligence and machine learning?',
            'file_ids': json.dumps([self.uploaded_file_id] if self.uploaded_file_id else [])
        }
        
        success, response = self.run_test(
            "Submit Research Question",
            "POST",
            "research",
            200,
            form_data=form_data
        )
        
        if success and 'question_id' in response:
            self.question_id = response['question_id']
            print(f"   Created research question with ID: {self.question_id}")
            return True
        return False

    def test_research_status_polling(self):
        """Test polling for research question status"""
        if not self.question_id:
            print("❌ No question ID available for testing")
            return False
            
        max_attempts = 20  # 20 seconds max wait
        attempts = 0
        
        while attempts < max_attempts:
            success, response = self.run_test(
                f"Check Research Status (Attempt {attempts + 1})",
                "GET",
                f"research/{self.question_id}",
                200
            )
            
            if success:
                status = response.get('status', 'unknown')
                print(f"   Current status: {status}")
                
                if status == 'completed':
                    print("✅ Research completed successfully!")
                    if 'report' in response:
                        report = response['report']
                        print(f"   Report generated with {len(report.get('citations', []))} citations")
                    return True
                elif status == 'failed':
                    print("❌ Research processing failed")
                    return False
                elif status in ['pending', 'processing']:
                    attempts += 1
                    if attempts < max_attempts:
                        print(f"   Waiting 1 second before next check...")
                        time.sleep(1)
                    continue
                else:
                    print(f"❌ Unknown status: {status}")
                    return False
            else:
                return False
                
        print("❌ Research processing timed out")
        return False

    def test_get_user_reports(self):
        """Test getting user reports"""
        if not self.user_id:
            print("❌ No user ID available for testing")
            return False
            
        success, response = self.run_test(
            "Get User Reports",
            "GET",
            f"reports/{self.user_id}",
            200
        )
        
        if success:
            report_count = len(response) if isinstance(response, list) else 0
            print(f"   Found {report_count} reports for user")
            return True
        return False

    def test_get_user_stats(self):
        """Test getting user statistics"""
        if not self.user_id:
            print("❌ No user ID available for testing")
            return False
            
        success, response = self.run_test(
            "Get User Stats",
            "GET",
            f"stats/{self.user_id}",
            200
        )
        
        if success:
            print(f"   Credits remaining: {response.get('credits_remaining', 'N/A')}")
            print(f"   Questions asked: {response.get('total_questions_asked', 'N/A')}")
            print(f"   Reports generated: {response.get('reports_generated', 'N/A')}")
            return True
        return False

    def test_get_news(self):
        """Test getting latest news/live data"""
        success, response = self.run_test(
            "Get Latest News",
            "GET",
            "news",
            200
        )
        
        if success:
            news_count = len(response) if isinstance(response, list) else 0
            print(f"   Found {news_count} news items")
            return True
        return False

def main():
    print("🚀 Starting Smart Research Assistant API Tests")
    print("=" * 60)
    
    tester = SmartResearchAPITester()
    
    # Test sequence
    tests = [
        ("Root Endpoint", tester.test_root_endpoint),
        ("User Creation", tester.test_create_user),
        ("Get User", tester.test_get_user),
        ("File Upload", tester.test_file_upload),
        ("Research Question", tester.test_research_question_submission),
        ("Research Processing", tester.test_research_status_polling),
        ("User Reports", tester.test_get_user_reports),
        ("User Statistics", tester.test_get_user_stats),
        ("Latest News", tester.test_get_news),
    ]
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            test_func()
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
        
        # Small delay between tests
        time.sleep(0.5)
    
    # Print final results
    print(f"\n{'='*60}")
    print(f"📊 FINAL RESULTS")
    print(f"{'='*60}")
    print(f"Tests Run: {tester.tests_run}")
    print(f"Tests Passed: {tester.tests_passed}")
    print(f"Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "0%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed. Check the output above for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())