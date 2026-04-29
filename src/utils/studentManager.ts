
import { supabase } from '../lib/supabase';
import { normalizeClassName } from './classNameNormalizer';

export interface StudentProfile {
    studentName: string;
    studentNumber: string;
    className: string;
}

export const registerStudent = async (profile: StudentProfile): Promise<string | null> => {
    if (!profile.studentNumber || !profile.studentName) return null;

    try {
        console.log('Registering student:', profile);
        
        // 标准化班级名称
        const normalizedClassName = normalizeClassName(profile.className);
        
        const { data, error } = await supabase
            .from('students')
            .upsert({
                student_number: profile.studentNumber,
                student_name: profile.studentName,
                class_name: normalizedClassName,
                last_practice_at: new Date().toISOString(),
                // We handle total_practices increment separately or trigger it here? 
                // For login, we just want to ensure they exist.
            }, { onConflict: 'student_number' })
            .select()
            .single();

        if (error) {
            console.error('Error registering student:', error);
            return null;
        }

        console.log('Student registered successfully:', data);
        return data.id;
    } catch (error) {
        console.error('Exception registering student:', error);
        return null;
    }
};
