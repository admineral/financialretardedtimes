import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

// Get cache statistics
export async function GET() {
  try {
    const cacheDir = join(process.cwd(), 'cache')
    const screenshotDir = join(cacheDir, 'screenshots')
    const ideasDir = join(cacheDir, 'ideas')
    
    // Helper function to get directory stats
    async function getDirStats(dirPath: string) {
      try {
        const files = await readdir(dirPath)
        let totalSize = 0
        let totalFiles = 0
        let oldestFile: string | null = null
        let newestFile: string | null = null
        let oldestTime = Infinity
        let newestTime = 0

        for (const file of files) {
          if (file.endsWith('.png') || file.endsWith('.json')) {
            const filePath = join(dirPath, file)
            const stats = await stat(filePath)
            totalSize += stats.size
            totalFiles++
            
            if (stats.mtime.getTime() < oldestTime) {
              oldestTime = stats.mtime.getTime()
              oldestFile = file
            }
            
            if (stats.mtime.getTime() > newestTime) {
              newestTime = stats.mtime.getTime()
              newestFile = file
            }
          }
        }

        return {
          totalFiles,
          totalSize,
          oldestFile,
          newestFile,
          oldestTime: oldestTime === Infinity ? null : oldestTime,
          newestTime: newestTime === 0 ? null : newestTime,
        }
      } catch {
        return {
          totalFiles: 0,
          totalSize: 0,
          oldestFile: null,
          newestFile: null,
          oldestTime: null,
          newestTime: null,
        }
      }
    }

    const [screenshotStats, ideasStats] = await Promise.all([
      getDirStats(screenshotDir),
      getDirStats(ideasDir)
    ])

    const totalStats = {
      screenshots: {
        ...screenshotStats,
        sizeFormatted: `${Math.round(screenshotStats.totalSize / 1024 / 1024 * 100) / 100} MB`,
      },
      ideas: {
        ...ideasStats,
        sizeFormatted: `${Math.round(ideasStats.totalSize / 1024 * 100) / 100} KB`,
      },
      total: {
        files: screenshotStats.totalFiles + ideasStats.totalFiles,
        size: screenshotStats.totalSize + ideasStats.totalSize,
        sizeFormatted: `${Math.round((screenshotStats.totalSize + ideasStats.totalSize) / 1024 / 1024 * 100) / 100} MB`,
      }
    }

    console.log(`📊 [CACHE STATS] Screenshots: ${screenshotStats.totalFiles} files, Ideas: ${ideasStats.totalFiles} files`)

    return NextResponse.json(totalStats, { headers: corsHeaders })
    
  } catch (error) {
    console.error('Error getting cache stats:', error)
    return NextResponse.json(
      { error: 'Failed to get cache statistics' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// Clear cache
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'screenshots' | 'ideas' | 'all'
  
  try {
    const cacheDir = join(process.cwd(), 'cache')
    let clearedCount = 0
    
    async function clearDirectory(dirPath: string, description: string) {
      try {
        const files = await readdir(dirPath)
        let cleared = 0
        
        for (const file of files) {
          if (file.endsWith('.png') || file.endsWith('.json')) {
            await import('fs/promises').then(fs => fs.unlink(join(dirPath, file)))
            cleared++
          }
        }
        
        console.log(`🗑️ [CACHE CLEAR] Cleared ${cleared} ${description} files`)
        return cleared
      } catch (error) {
        console.error(`Failed to clear ${description}:`, error)
        return 0
      }
    }
    
    if (type === 'screenshots' || type === 'all') {
      clearedCount += await clearDirectory(join(cacheDir, 'screenshots'), 'screenshot')
    }
    
    if (type === 'ideas' || type === 'all') {
      clearedCount += await clearDirectory(join(cacheDir, 'ideas'), 'ideas')
    }
    
    return NextResponse.json({
      message: `Cleared ${clearedCount} cache files`,
      type: type || 'all',
      clearedCount
    }, { headers: corsHeaders })
    
  } catch (error) {
    console.error('Error clearing cache:', error)
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500, headers: corsHeaders }
    )
  }
}
