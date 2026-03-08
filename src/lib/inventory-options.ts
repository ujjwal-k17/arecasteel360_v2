export const MATERIALS = [
  'HR', 'HR Chq', 'HRPO', 'CR', 'GP', 'GPSP', 'PPGI', 'PPGL', 'BGL', 'Structure', 'Others',
];

export const MAKES = [
  'AMNS', 'JSW', 'TATA', 'Gaurang', 'SAIL', 'POSCO', 'Indradhanush', 'BPSL', 'Hitech', 'Others',
];

export const COATING_BY_MATERIAL: Record<string, string[]> = {
  CR: [],
  GP: ['80gsm', '90gsm', '100gsm', '120gsm', '180gsm', '275gsm', '350gsm', 'Other'],
  HR: [],
  BGL: ['AZ70', 'AZ150'],
  GPSP: ['80gsm', '90gsm', '100gsm', '120gsm', '180gsm', '275gsm', '350gsm', 'Other'],
  HRPO: [],
  PPGI: ['80gsm', '90gsm', '120gsm', '275gsm'],
  PPGL: ['AZ70', 'AZ150 - RMP', 'AZ150 - SMP', 'AZ150 - SDP', 'AZ200 - PVDF'],
  'HR Chq': [],
  Others: [],
  Structure: [],
};

export const GRADE_BY_MATERIAL: Record<string, string[]> = {
  CR: ['D', 'DD', 'EDD/IF'],
  GP: ['GP250', 'GP350', 'Tad', 'GPH'],
  HR: ['IS10748 Gr1', 'IS10748 Gr2', 'IS1079', 'IS2062 E250', 'IS2062 E350', 'Others'],
  BGL: ['250mpa', '300mpa', '350mpa', '550mpa'],
  GPSP: ['GP250', 'GP350', 'Tad', 'EDD', 'IF Normal', 'IF Oily', 'IF Chromated'],
  HRPO: ['IS10748', 'IS1079'],
  PPGI: [
    'RAL 5012', 'RAL 9002 - Soft', 'RAL 9002 - Hard', 'RAL 9003 - Soft', 'RAL 9003 - Hard',
    'RAL 7016', 'RAL 7024', 'RAL 7035', 'RAL 7037', 'Seco Red', 'Brick Red',
    'RAL 6002', 'RAL 6016', 'RAL 2008 (Orange)', 'Black', 'RAL 3020 (Traffic Red)',
  ],
  PPGL: [
    'RAL 5012', 'RAL 9002', 'RAL 9003', 'RAL 7016', 'RAL 7024', 'RAL 7035', 'RAL 7037',
    'Seco Red', 'Brick Red', 'RAL 6002', 'RAL 6016', 'RAL 2008 (Orange)', 'RAL 7043',
  ],
  'HR Chq': ['IS 3502'],
  Others: [],
  Structure: [],
};
