/**
 * States & Union Territories of India with their principal cities, used to
 * populate the State → City dropdowns. State is validated against this list;
 * city may be any name (the list is suggestions, plus an "Other" entry in the
 * UI) so small towns and villages are never blocked.
 */
export interface IndianState {
  code: string;
  name: string;
  type: 'STATE' | 'UT';
  cities: string[];
}

export const INDIA_STATES: IndianState[] = [
  { code: 'AN', name: 'Andaman and Nicobar Islands', type: 'UT', cities: ['Port Blair', 'Diglipur', 'Mayabunder', 'Rangat', 'Car Nicobar'] },
  { code: 'AP', name: 'Andhra Pradesh', type: 'STATE', cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati', 'Rajahmundry', 'Kakinada', 'Kadapa', 'Anantapur', 'Eluru', 'Ongole', 'Srikakulam', 'Vizianagaram', 'Amaravati'] },
  { code: 'AR', name: 'Arunachal Pradesh', type: 'STATE', cities: ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang', 'Ziro', 'Bomdila', 'Tezu', 'Along'] },
  { code: 'AS', name: 'Assam', type: 'STATE', cities: ['Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur', 'Bongaigaon', 'Dhubri', 'Sivasagar', 'Goalpara', 'Barpeta'] },
  { code: 'BR', name: 'Bihar', type: 'STATE', cities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Arrah', 'Begusarai', 'Katihar', 'Munger', 'Chapra', 'Saharsa', 'Sitamarhi', 'Hajipur', 'Bodh Gaya'] },
  { code: 'CH', name: 'Chandigarh', type: 'UT', cities: ['Chandigarh'] },
  { code: 'CG', name: 'Chhattisgarh', type: 'STATE', cities: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon', 'Jagdalpur', 'Raigarh', 'Ambikapur', 'Dhamtari'] },
  { code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu', type: 'UT', cities: ['Daman', 'Diu', 'Silvassa'] },
  { code: 'DL', name: 'Delhi', type: 'UT', cities: ['New Delhi', 'Delhi', 'Dwarka', 'Rohini', 'Karol Bagh', 'Chandni Chowk', 'Saket', 'Lajpat Nagar', 'Mayur Vihar', 'Janakpuri', 'Pitampura', 'Shahdara'] },
  { code: 'GA', name: 'Goa', type: 'STATE', cities: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda', 'Bicholim', 'Curchorem'] },
  { code: 'GJ', name: 'Gujarat', type: 'STATE', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Navsari', 'Morbi', 'Nadiad', 'Bharuch', 'Mehsana', 'Porbandar', 'Dwarka', 'Somnath', 'Vapi'] },
  { code: 'HR', name: 'Haryana', type: 'STATE', cities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar', 'Karnal', 'Sonipat', 'Panchkula', 'Kurukshetra', 'Bhiwani', 'Sirsa', 'Rewari'] },
  { code: 'HP', name: 'Himachal Pradesh', type: 'STATE', cities: ['Shimla', 'Dharamshala', 'Mandi', 'Solan', 'Kullu', 'Manali', 'Hamirpur', 'Una', 'Bilaspur', 'Chamba', 'Kangra'] },
  { code: 'JK', name: 'Jammu and Kashmir', type: 'UT', cities: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Sopore', 'Kathua', 'Udhampur', 'Katra', 'Pulwama', 'Rajouri'] },
  { code: 'JH', name: 'Jharkhand', type: 'STATE', cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh', 'Giridih', 'Ramgarh', 'Phusro', 'Dumka', 'Chaibasa'] },
  { code: 'KA', name: 'Karnataka', type: 'STATE', cities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Dharwad', 'Belagavi', 'Kalaburagi', 'Ballari', 'Davanagere', 'Shivamogga', 'Tumakuru', 'Udupi', 'Vijayapura', 'Hassan', 'Mandya', 'Hampi'] },
  { code: 'KL', name: 'Kerala', type: 'STATE', cities: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad', 'Kottayam', 'Malappuram', 'Kasaragod', 'Guruvayur', 'Sabarimala'] },
  { code: 'LA', name: 'Ladakh', type: 'UT', cities: ['Leh', 'Kargil'] },
  { code: 'LD', name: 'Lakshadweep', type: 'UT', cities: ['Kavaratti', 'Agatti', 'Minicoy', 'Amini'] },
  { code: 'MP', name: 'Madhya Pradesh', type: 'STATE', cities: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa', 'Khandwa', 'Burhanpur', 'Chhindwara', 'Omkareshwar', 'Khajuraho'] },
  { code: 'MH', name: 'Maharashtra', type: 'STATE', cities: ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad (Chhatrapati Sambhajinagar)', 'Solapur', 'Kolhapur', 'Navi Mumbai', 'Kalyan-Dombivli', 'Vasai-Virar', 'Amravati', 'Sangli', 'Jalgaon', 'Akola', 'Latur', 'Ahmednagar', 'Satara', 'Ratnagiri', 'Shirdi', 'Lonavala'] },
  { code: 'MN', name: 'Manipur', type: 'STATE', cities: ['Imphal', 'Thoubal', 'Bishnupur', 'Churachandpur', 'Ukhrul', 'Kakching'] },
  { code: 'ML', name: 'Meghalaya', type: 'STATE', cities: ['Shillong', 'Tura', 'Jowai', 'Nongpoh', 'Cherrapunji (Sohra)'] },
  { code: 'MZ', name: 'Mizoram', type: 'STATE', cities: ['Aizawl', 'Lunglei', 'Champhai', 'Serchhip', 'Kolasib'] },
  { code: 'NL', name: 'Nagaland', type: 'STATE', cities: ['Kohima', 'Dimapur', 'Mokokchung', 'Tuensang', 'Wokha', 'Mon'] },
  { code: 'OD', name: 'Odisha', type: 'STATE', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Puri', 'Berhampur', 'Sambalpur', 'Balasore', 'Bhadrak', 'Baripada', 'Jharsuguda', 'Konark'] },
  { code: 'PY', name: 'Puducherry', type: 'UT', cities: ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'] },
  { code: 'PB', name: 'Punjab', type: 'STATE', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Pathankot', 'Hoshiarpur', 'Moga', 'Firozpur', 'Kapurthala', 'Anandpur Sahib'] },
  { code: 'RJ', name: 'Rajasthan', type: 'STATE', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Alwar', 'Bhilwara', 'Sikar', 'Bharatpur', 'Pushkar', 'Mount Abu', 'Jaisalmer', 'Chittorgarh', 'Nathdwara'] },
  { code: 'SK', name: 'Sikkim', type: 'STATE', cities: ['Gangtok', 'Namchi', 'Gyalshing', 'Mangan', 'Rangpo'] },
  { code: 'TN', name: 'Tamil Nadu', type: 'STATE', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Thanjavur', 'Tiruppur', 'Kanchipuram', 'Rameswaram', 'Kanyakumari', 'Kumbakonam', 'Hosur'] },
  { code: 'TS', name: 'Telangana', type: 'STATE', cities: ['Hyderabad', 'Secunderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Siddipet'] },
  { code: 'TR', name: 'Tripura', type: 'STATE', cities: ['Agartala', 'Udaipur', 'Dharmanagar', 'Kailashahar', 'Belonia'] },
  { code: 'UP', name: 'Uttar Pradesh', type: 'STATE', cities: ['Lucknow', 'Kanpur', 'Varanasi', 'Prayagraj', 'Agra', 'Ghaziabad', 'Noida', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad', 'Gorakhpur', 'Saharanpur', 'Jhansi', 'Mathura', 'Vrindavan', 'Ayodhya', 'Firozabad', 'Muzaffarnagar', 'Greater Noida'] },
  { code: 'UK', name: 'Uttarakhand', type: 'STATE', cities: ['Dehradun', 'Haridwar', 'Rishikesh', 'Haldwani', 'Roorkee', 'Nainital', 'Rudrapur', 'Kashipur', 'Mussoorie', 'Kedarnath', 'Badrinath'] },
  { code: 'WB', name: 'West Bengal', type: 'STATE', cities: ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Bardhaman', 'Kharagpur', 'Haldia', 'Malda', 'Krishnanagar', 'Darjeeling', 'Salt Lake (Bidhannagar)', 'Barasat', 'Serampore', 'Chandannagar', 'Shantiniketan'] },
];

const BY_NAME = new Map(INDIA_STATES.map((s) => [s.name.toLowerCase(), s]));

/** Canonical state name for a user-supplied name or code, or null. */
export function canonicalState(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  return BY_NAME.get(v)?.name ?? INDIA_STATES.find((s) => s.code.toLowerCase() === v)?.name ?? null;
}
